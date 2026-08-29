#!/usr/bin/env bash
set -euo pipefail

DB=keep_verify_ci
PSQL="psql -v ON_ERROR_STOP=1 -X -q"

if [ -n "${PGHOST:-}" ]; then
  pg() { $PSQL "$@"; }
else
  pg() {
    local cmd="$PSQL"
    for a in "$@"; do cmd+=" $(printf '%q' "$a")"; done
    su postgres -c "$cmd"
  }
fi

echo "== Invitation ami : profil partagé -> pseudo prérempli -> parrainage =="
pg -d "$DB" <<'SQL'
\set ON_ERROR_STOP on

do $$
declare
  referrer uuid := gen_random_uuid();
  referred uuid := gen_random_uuid();
  result jsonb;
  linked_referrer uuid;
  stored_code text;
begin
  insert into auth.users(id,is_anonymous,created_at) values(referrer,false,now()-interval '30 days');
  insert into public.profiles(id,username,is_public) values(referrer,'invite_ci_friend',true);

  insert into auth.users(id,is_anonymous,created_at) values(referred,false,now());
  insert into public.profiles(id,username,is_public) values(referred,'invite_ci_new_user',true);

  perform set_config('request.jwt.claim.sub', referred::text, true);
  select public.keep_claim_referral('INVITE_CI_FRIEND') into result;

  if coalesce((result->>'qualified')::boolean,false) is not true then
    raise exception 'FAIL invitation profil : qualified attendu, résultat %', result;
  end if;

  select referrer_profile_id, referral_code
  into linked_referrer, stored_code
  from public.keep_referrals
  where referred_profile_id=referred;

  if linked_referrer is distinct from referrer then
    raise exception 'FAIL invitation profil : mauvais parrain % au lieu de %', linked_referrer, referrer;
  end if;
  if stored_code is null or stored_code !~ '^K[A-F0-9]{10}$' then
    raise exception 'FAIL invitation profil : code canonique invalide %', stored_code;
  end if;

  if not exists(select 1 from public.notifications where profile_id=referrer and type='REFERRAL_QUALIFIED') then
    raise exception 'FAIL invitation profil : notification parrain absente';
  end if;

  raise notice 'OK invitation profil : pseudo prérempli -> parrainage canonique %', stored_code;
end;
$$;
SQL

echo "TEST INVITATION AMI PRÉREMPLIE : OK"
