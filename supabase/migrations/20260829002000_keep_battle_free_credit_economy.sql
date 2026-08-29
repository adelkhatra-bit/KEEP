-- KEEP BATTLE free-credit economy. Promotional FREE credits only; paid-plan entitlements are never debited.

create table if not exists public.keep_battle_credit_events (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references public.keep_battles(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  result text not null check (result in ('WIN','LOSS')),
  amount integer not null check (amount <> 0),
  created_at timestamptz not null default now(),
  unique (battle_id, profile_id)
);

create index if not exists idx_keep_battle_credit_events_profile_created
  on public.keep_battle_credit_events(profile_id, created_at desc);

alter table public.keep_battle_credit_events enable row level security;
revoke all on public.keep_battle_credit_events from anon, authenticated;

insert into public.remote_config(key,value,description)
values
  ('battle_free_credit_enabled','true'::jsonb,'Active les gains/pertes de crédits Free dans KEEP BATTLE.'),
  ('battle_win_free_credits','3'::jsonb,'Crédits Free gagnés par le vainqueur d’une partie KEEP BATTLE.'),
  ('battle_loss_free_credits','3'::jsonb,'Crédits Free retirés au perdant, sans jamais passer sous zéro.')
on conflict (key) do nothing;

create or replace function public.keep_growth_free_credit_bonus_for_profile(p_uid uuid)
returns integer
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  shares integer := 0;
  follower_count integer := 0;
  s2 integer := 50; s3 integer := 100;
  f3 integer := 250; f5 integer := 1000;
  reward50 integer := 5; reward100 integer := 20;
  f250c integer := 5; f1000c integer := 20;
begin
  if p_uid is null then return 0; end if;
  shares := public.keep_qualified_share_count(p_uid);
  select count(*)::integer into follower_count from public.follows where followee_id=p_uid;
  s2 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_tier2_threshold' limit 1),50);
  s3 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_tier3_threshold' limit 1),100);
  f3 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier3_threshold' limit 1),250);
  f5 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier5_threshold' limit 1),1000);
  reward50 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_reward_50' limit 1),5);
  reward100 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_reward_100' limit 1),20);
  f250c := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_250_credits' limit 1),5);
  f1000c := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_1000_credits' limit 1),20);
  return (case when shares >= s2 then reward50 else 0 end)
       + (case when shares >= s3 then reward100 else 0 end)
       + (case when follower_count >= f3 then f250c else 0 end)
       + (case when follower_count >= f5 then f1000c else 0 end);
end;
$$;

create or replace function public.keep_battle_credit_adjustment_for_profile(p_uid uuid)
returns integer
language sql
stable
security definer
set search_path=public
as $$
  select coalesce(sum(amount),0)::integer
  from public.keep_battle_credit_events
  where profile_id=p_uid;
$$;

create or replace function public.keep_theoretical_free_credit_remaining_for_profile(p_uid uuid)
returns integer
language plpgsql
stable
security definer
set search_path=public,auth
as $$
declare
  guest_limit integer := 3;
  signup_bonus integer := 20;
  growth_bonus integer := 0;
  battle_adjustment integer := 0;
  ledger_used integer := 0;
  derived_used integer := 0;
  used integer := 0;
  capacity integer := 0;
begin
  if p_uid is null then return 0; end if;
  guest_limit := coalesce((select (value #>> '{}')::integer from public.remote_config where key='guest_success_limit' limit 1),3);
  signup_bonus := coalesce((select (value #>> '{}')::integer from public.remote_config where key='signup_bonus_successes' limit 1),20);
  growth_bonus := public.keep_growth_free_credit_bonus_for_profile(p_uid);
  battle_adjustment := public.keep_battle_credit_adjustment_for_profile(p_uid);
  ledger_used := coalesce((select consumed_count from public.download_credit_usage where profile_id=p_uid),0);
  derived_used := public.keep_chargeable_keep_count(p_uid);
  used := greatest(ledger_used,derived_used);
  capacity := greatest(used, guest_limit + signup_bonus + growth_bonus + battle_adjustment);
  return greatest(0, capacity-used);
end;
$$;

create or replace function public.keep_apply_battle_free_credit_result()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  enabled boolean := true;
  win_reward integer := 3;
  loss_penalty integer := 3;
  winner uuid;
  loser uuid;
  debit integer := 0;
  loser_remaining integer := 0;
begin
  if new.status <> 'COMPLETED' or old.status = 'COMPLETED' then return new; end if;
  if new.opponent_id is null or new.challenger_score = new.opponent_score then return new; end if;

  enabled := coalesce((select (value #>> '{}')::boolean from public.remote_config where key='battle_free_credit_enabled' limit 1),true);
  if not enabled then return new; end if;
  win_reward := greatest(0,coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_win_free_credits' limit 1),3));
  loss_penalty := greatest(0,coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_loss_free_credits' limit 1),3));

  if new.challenger_score > new.opponent_score then winner:=new.challenger_id; loser:=new.opponent_id;
  else winner:=new.opponent_id; loser:=new.challenger_id; end if;

  if win_reward > 0 then
    insert into public.keep_battle_credit_events(battle_id,profile_id,result,amount)
    values(new.id,winner,'WIN',win_reward)
    on conflict (battle_id,profile_id) do nothing;

    if found then
      insert into public.notifications(profile_id,type,title,body,data)
      values(winner,'BATTLE_REWARD','Victoire KEEP BATTLE',format('+%s Free ajoutés à ton compteur.',win_reward),jsonb_build_object('battleId',new.id,'creditDelta',win_reward,'result','WIN'));
    end if;
  end if;

  loser_remaining := public.keep_theoretical_free_credit_remaining_for_profile(loser);
  debit := least(loss_penalty,loser_remaining);
  if debit > 0 then
    insert into public.keep_battle_credit_events(battle_id,profile_id,result,amount)
    values(new.id,loser,'LOSS',-debit)
    on conflict (battle_id,profile_id) do nothing;

    if found then
      insert into public.notifications(profile_id,type,title,body,data)
      values(loser,'BATTLE_LOSS','KEEP BATTLE',format('-%s Free. Joue, gagne ou partage ton profil pour remonter.',debit),jsonb_build_object('battleId',new.id,'creditDelta',-debit,'result','LOSS'));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_keep_battle_free_credit_result on public.keep_battles;
create trigger trg_keep_battle_free_credit_result
after update of status on public.keep_battles
for each row execute function public.keep_apply_battle_free_credit_result();

create or replace function public.keep_battle_credit_status()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  won integer := 0;
  lost integer := 0;
  net integer := 0;
  remaining_free integer := 0;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  select coalesce(sum(amount) filter(where amount>0),0)::integer,
         coalesce(abs(sum(amount) filter(where amount<0)),0)::integer,
         coalesce(sum(amount),0)::integer
  into won,lost,net
  from public.keep_battle_credit_events where profile_id=uid;
  remaining_free := public.keep_theoretical_free_credit_remaining_for_profile(uid);
  return jsonb_build_object('won',won,'lost',lost,'net',net,'remainingFree',remaining_free);
end;
$$;

grant execute on function public.keep_battle_credit_status() to authenticated;
revoke all on function public.keep_growth_free_credit_bonus_for_profile(uuid) from anon, authenticated;
revoke all on function public.keep_battle_credit_adjustment_for_profile(uuid) from anon, authenticated;
revoke all on function public.keep_theoretical_free_credit_remaining_for_profile(uuid) from anon, authenticated;
revoke all on function public.keep_apply_battle_free_credit_result() from anon, authenticated;

create or replace function public.keep_download_credit_status()
returns table(plan_code text,is_anonymous boolean,consumed integer,credit_limit integer,remaining integer,unlimited boolean)
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  uid uuid := auth.uid();
  guest_limit integer := 3;
  signup_bonus integer := 20;
  ledger_used integer := 0;
  derived_used integer := 0;
  used integer := 0;
  anon boolean := false;
  active_plan text := 'FREE';
  daily_limit integer := 40;
  day_key text := to_char(current_date,'YYYY-MM-DD');
  reward record;
  reward_credits integer := 0;
  battle_adjustment integer := 0;
  raw_limit integer := 0;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  guest_limit := coalesce((select (rc.value #>> '{}')::integer from public.remote_config rc where rc.key='guest_success_limit' limit 1),3);
  signup_bonus := coalesce((select (rc.value #>> '{}')::integer from public.remote_config rc where rc.key='signup_bonus_successes' limit 1),20);
  anon := coalesce((select u.is_anonymous from auth.users u where u.id=uid),false);
  active_plan := public.keep_active_plan_code(uid);
  plan_code := active_plan; is_anonymous := anon;

  if active_plan in ('CREATOR_PRO','VENUE_PRO') then consumed:=0; credit_limit:=null; remaining:=null; unlimited:=true; return next; return; end if;
  if active_plan='PREMIUM' then
    daily_limit := coalesce(public.keep_plan_limit('PREMIUM','downloads_per_day'),40);
    select coalesce(used_count,0) into used from public.feature_usage_counters where profile_id=uid and feature_key='DOWNLOAD' and period_key=day_key;
    used:=coalesce(used,0); consumed:=used; credit_limit:=daily_limit; remaining:=greatest(daily_limit-used,0); unlimited:=false; return next; return;
  end if;

  ledger_used := coalesce((select d.consumed_count from public.download_credit_usage d where d.profile_id=uid),0);
  if anon then used:=ledger_used; reward_credits:=0; battle_adjustment:=0;
  else
    derived_used := public.keep_chargeable_keep_count(uid);
    used := greatest(ledger_used,derived_used);
    if used>ledger_used then
      insert into public.download_credit_usage(profile_id,consumed_count,updated_at) values(uid,used,now())
      on conflict(profile_id) do update set consumed_count=greatest(public.download_credit_usage.consumed_count,excluded.consumed_count),updated_at=now();
    end if;
    select * into reward from public.keep_growth_reward_status();
    reward_credits := coalesce(reward.bonus_free_credits,0);
    battle_adjustment := public.keep_battle_credit_adjustment_for_profile(uid);
  end if;

  raw_limit := case when anon then guest_limit else guest_limit+signup_bonus+reward_credits+battle_adjustment end;
  consumed:=used; unlimited:=false; credit_limit:=greatest(used,raw_limit); remaining:=greatest(0,credit_limit-used); return next;
end;
$$;

grant execute on function public.keep_download_credit_status() to authenticated;
