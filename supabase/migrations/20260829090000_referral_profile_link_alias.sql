-- KEEP — invitation ami sans code à recopier.
-- Un lien de profil partagé contient déjà ?u=pseudo&share=profile. Le client
-- conserve ce pseudo comme alias de parrainage ; le RPC accepte donc soit le
-- code KXXXXXXXXXX historique, soit le pseudo public de l'invitant.

create or replace function public.keep_claim_referral(p_code text)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  uid uuid:=auth.uid();
  referrer uuid;
  code_clean text:=upper(trim(coalesce(p_code,'')));
  user_created timestamptz;
  is_anon boolean:=true;
  rules jsonb;
  month_count integer:=0;
  month_bonus integer:=0;
  canonical_code text;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if code_clean='' then raise exception 'REFERRAL_CODE_REQUIRED'; end if;

  select coalesce(is_anonymous,true),created_at
  into is_anon,user_created
  from auth.users
  where id=uid;

  if user_created is null or is_anon then raise exception 'REFERRAL_REAL_ACCOUNT_REQUIRED'; end if;
  if user_created < now()-interval '7 days' then raise exception 'REFERRAL_WINDOW_EXPIRED'; end if;

  -- 1) Code de parrainage explicite historique.
  select profile_id, code
  into referrer, canonical_code
  from public.keep_referral_codes
  where code=code_clean;

  -- 2) Sinon le pseudo du profil partagé est un alias prêt à l'emploi.
  if referrer is null then
    select p.id
    into referrer
    from public.profiles p
    where upper(p.username)=code_clean
      and p.is_public=true
    limit 1;

    if referrer is not null then
      -- Génère/récupère le code canonique du parrain sans changer l'identité
      -- enregistrée dans keep_referrals.
      select rc.code into canonical_code
      from public.keep_referral_codes rc
      where rc.profile_id=referrer;

      if canonical_code is null then
        canonical_code := 'K' || upper(substr(md5(referrer::text || ':KEEP:REFERRAL'),1,10));
        insert into public.keep_referral_codes(profile_id,code)
        values(referrer,canonical_code)
        on conflict(profile_id) do nothing;
        select rc.code into canonical_code from public.keep_referral_codes rc where rc.profile_id=referrer;
      end if;
    end if;
  end if;

  if referrer is null then raise exception 'REFERRAL_CODE_INVALID'; end if;
  if referrer=uid then raise exception 'REFERRAL_SELF_FORBIDDEN'; end if;
  if exists(select 1 from public.keep_referrals where referred_profile_id=uid) then
    return public.keep_referral_status();
  end if;

  insert into public.keep_referrals(referred_profile_id,referrer_profile_id,referral_code)
  values(uid,referrer,coalesce(canonical_code,code_clean));

  select public.keep_referral_rules() into rules;
  select count(*)::integer into month_count
  from public.keep_referrals
  where referrer_profile_id=referrer
    and qualified_at>=date_trunc('month',now());

  month_bonus:=least(
    (rules->>'monthly_cap')::integer,
    month_count*(rules->>'free_per_signup')::integer
      + case when month_count>=3 then (rules->>'bonus_3')::integer else 0 end
      + case when month_count>=5 then (rules->>'bonus_5')::integer else 0 end
      + case when month_count>=10 then (rules->>'bonus_10')::integer else 0 end
  );

  insert into public.notifications(profile_id,type,title,body,data)
  values(
    referrer,
    'REFERRAL_QUALIFIED',
    '🎁 Nouveau parrainage KEEP',
    format('Un nouvel utilisateur a rejoint KEEP grâce à toi. Tes Free de parrainage du mois passent à %s.',month_bonus),
    jsonb_build_object('referredProfileId',uid,'monthReferrals',month_count,'monthFreeEarned',month_bonus)
  );

  return jsonb_build_object(
    'qualified',true,
    'referrerProfileId',referrer,
    'monthReferrals',month_count,
    'monthFreeEarned',month_bonus
  );
end;
$$;

revoke all on function public.keep_claim_referral(text) from public;
grant execute on function public.keep_claim_referral(text) to authenticated;
