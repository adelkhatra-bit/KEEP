create table if not exists public.keep_referral_codes (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.keep_referrals (
  referred_profile_id uuid primary key references public.profiles(id) on delete cascade,
  referrer_profile_id uuid not null references public.profiles(id) on delete cascade,
  referral_code text not null,
  qualified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint keep_referrals_not_self check (referred_profile_id <> referrer_profile_id)
);
create index if not exists keep_referrals_referrer_qualified_idx on public.keep_referrals(referrer_profile_id, qualified_at desc);

alter table public.keep_referral_codes enable row level security;
alter table public.keep_referrals enable row level security;

drop policy if exists keep_referral_codes_read_own on public.keep_referral_codes;
create policy keep_referral_codes_read_own on public.keep_referral_codes for select to authenticated using (profile_id = auth.uid());
drop policy if exists keep_referrals_read_own on public.keep_referrals;
create policy keep_referrals_read_own on public.keep_referrals for select to authenticated using (referrer_profile_id = auth.uid() or referred_profile_id = auth.uid());

insert into public.remote_config(key,value) values
 ('referral_free_per_signup','2'::jsonb),
 ('referral_bonus_3','3'::jsonb),
 ('referral_bonus_5','5'::jsonb),
 ('referral_bonus_10','10'::jsonb),
 ('referral_monthly_free_cap','40'::jsonb)
on conflict(key) do update set value=excluded.value, updated_at=now();

create or replace function public.keep_referral_rules()
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
  'free_per_signup',coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_free_per_signup'),2),
  'bonus_3',coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_bonus_3'),3),
  'bonus_5',coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_bonus_5'),5),
  'bonus_10',coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_bonus_10'),10),
  'monthly_cap',coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_monthly_free_cap'),40)
 );
$$;
revoke all on function public.keep_referral_rules() from public;
grant execute on function public.keep_referral_rules() to anon,authenticated;

create or replace function public.keep_my_referral_code()
returns text language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); result_code text;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if not exists(select 1 from public.profiles where id=uid) then raise exception 'PROFILE_REQUIRED'; end if;
 select code into result_code from public.keep_referral_codes where profile_id=uid;
 if result_code is null then
   result_code := 'K' || upper(substr(md5(uid::text || ':KEEP:REFERRAL'),1,10));
   insert into public.keep_referral_codes(profile_id,code) values(uid,result_code)
   on conflict(profile_id) do nothing;
   select code into result_code from public.keep_referral_codes where profile_id=uid;
 end if;
 return result_code;
end;
$$;
revoke all on function public.keep_my_referral_code() from public;
grant execute on function public.keep_my_referral_code() to authenticated;

create or replace function public.keep_referral_free_credit_bonus_for_profile(p_uid uuid)
returns integer language plpgsql stable security definer set search_path=public as $$
declare per_signup integer:=2; b3 integer:=3; b5 integer:=5; b10 integer:=10; monthly_cap integer:=40; total_bonus integer:=0;
begin
 if p_uid is null then return 0; end if;
 per_signup:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_free_per_signup'),2);
 b3:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_bonus_3'),3);
 b5:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_bonus_5'),5);
 b10:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_bonus_10'),10);
 monthly_cap:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_monthly_free_cap'),40);
 select coalesce(sum(least(monthly_cap,
   c*per_signup + case when c>=3 then b3 else 0 end + case when c>=5 then b5 else 0 end + case when c>=10 then b10 else 0 end
 )),0)::integer into total_bonus
 from (
   select date_trunc('month',qualified_at) month_bucket,count(*)::integer c
   from public.keep_referrals where referrer_profile_id=p_uid group by 1
 ) m;
 return total_bonus;
end;
$$;

create or replace function public.keep_referral_status()
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); month_count integer:=0; lifetime_count integer:=0; month_bonus integer:=0; total_bonus integer:=0; r jsonb;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 select public.keep_referral_rules() into r;
 select count(*)::integer into month_count from public.keep_referrals where referrer_profile_id=uid and qualified_at>=date_trunc('month',now());
 select count(*)::integer into lifetime_count from public.keep_referrals where referrer_profile_id=uid;
 month_bonus:=least((r->>'monthly_cap')::integer,
   month_count*(r->>'free_per_signup')::integer +
   case when month_count>=3 then (r->>'bonus_3')::integer else 0 end +
   case when month_count>=5 then (r->>'bonus_5')::integer else 0 end +
   case when month_count>=10 then (r->>'bonus_10')::integer else 0 end);
 total_bonus:=public.keep_referral_free_credit_bonus_for_profile(uid);
 return r || jsonb_build_object('month_referrals',month_count,'lifetime_referrals',lifetime_count,'month_free_earned',month_bonus,'total_free_earned',total_bonus,'code',public.keep_my_referral_code());
end;
$$;
revoke all on function public.keep_referral_status() from public;
grant execute on function public.keep_referral_status() to authenticated;

create or replace function public.keep_claim_referral(p_code text)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare uid uuid:=auth.uid(); referrer uuid; code_clean text:=upper(trim(coalesce(p_code,''))); user_created timestamptz; is_anon boolean:=true; rules jsonb; month_count integer:=0; month_bonus integer:=0;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if code_clean='' then raise exception 'REFERRAL_CODE_REQUIRED'; end if;
 select coalesce(is_anonymous,true),created_at into is_anon,user_created from auth.users where id=uid;
 if user_created is null or is_anon then raise exception 'REFERRAL_REAL_ACCOUNT_REQUIRED'; end if;
 if user_created < now()-interval '7 days' then raise exception 'REFERRAL_WINDOW_EXPIRED'; end if;
 select profile_id into referrer from public.keep_referral_codes where code=code_clean;
 if referrer is null then raise exception 'REFERRAL_CODE_INVALID'; end if;
 if referrer=uid then raise exception 'REFERRAL_SELF_FORBIDDEN'; end if;
 if exists(select 1 from public.keep_referrals where referred_profile_id=uid) then return public.keep_referral_status(); end if;
 insert into public.keep_referrals(referred_profile_id,referrer_profile_id,referral_code) values(uid,referrer,code_clean);
 select public.keep_referral_rules() into rules;
 select count(*)::integer into month_count from public.keep_referrals where referrer_profile_id=referrer and qualified_at>=date_trunc('month',now());
 month_bonus:=least((rules->>'monthly_cap')::integer,month_count*(rules->>'free_per_signup')::integer+case when month_count>=3 then (rules->>'bonus_3')::integer else 0 end+case when month_count>=5 then (rules->>'bonus_5')::integer else 0 end+case when month_count>=10 then (rules->>'bonus_10')::integer else 0 end);
 insert into public.notifications(profile_id,type,title,body,data) values(referrer,'REFERRAL_QUALIFIED','🎁 Nouveau parrainage KEEP',format('Un nouvel utilisateur a rejoint KEEP grâce à toi. Tes Free de parrainage du mois passent à %s.',month_bonus),jsonb_build_object('referredProfileId',uid,'monthReferrals',month_count,'monthFreeEarned',month_bonus));
 return jsonb_build_object('qualified',true,'referrerProfileId',referrer,'monthReferrals',month_count,'monthFreeEarned',month_bonus);
end;
$$;
revoke all on function public.keep_claim_referral(text) from public;
grant execute on function public.keep_claim_referral(text) to authenticated;

create or replace function public.keep_growth_free_credit_bonus_for_profile(p_uid uuid)
returns integer language plpgsql stable security definer set search_path=public as $$
declare follower_count integer:=0; f3 integer:=250; f5 integer:=1000; f250c integer:=5; f1000c integer:=20; referral_bonus integer:=0;
begin
 if p_uid is null then return 0; end if;
 select count(*)::integer into follower_count from public.follows where followee_id=p_uid;
 f3:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier3_threshold'),250);
 f5:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier5_threshold'),1000);
 f250c:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_250_credits'),5);
 f1000c:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_1000_credits'),20);
 referral_bonus:=public.keep_referral_free_credit_bonus_for_profile(p_uid);
 return referral_bonus + (case when follower_count>=f3 then f250c else 0 end) + (case when follower_count>=f5 then f1000c else 0 end);
end;
$$;