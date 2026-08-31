#!/usr/bin/env bash
# KEEP — test de non-régression confidentialité Public / Privé.
#
# Précondition : supabase/scripts/verify-migrations.sh vient d'être exécuté et
# a créé keep_verify_ci avec toutes les migrations appliquées.
# Le contrat actuel impose une seule décision KEPT par profil/morceau. Le test
# reproduit donc le vrai parcours : KEEP PUBLIC -> passage PRIVATE -> retour
# PUBLIC sur la même décision, sans fabriquer un doublon désormais interdit.
#
# keep_own_profile_tracks est la bibliothèque canonique privée du propriétaire :
# elle doit conserver PUBLIC + PRIVATE pour l'anti-doublon. L'écran Profil filtre
# ensuite visibility='PUBLIC'. La sécurité serveur à vérifier ici est qu'aucune
# piste PRIVATE ne sorte du RPC public ni du snapshot public.
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

echo "== Confidentialité profil KEEP : PUBLIC -> PRIVÉ -> PUBLIC =="
pg -d "$DB" <<'SQL'
\set ON_ERROR_STOP on

do $$
declare
  uid uuid := gen_random_uuid();
  v_track_id uuid := gen_random_uuid();
  v_decision_id uuid;
  private_count int;
  owner_rows int;
  owner_public_rows int;
  public_profile_rows int;
  snapshot_public int;
begin
  insert into auth.users(id) values(uid);
  insert into public.profiles(id, username, is_public) values(uid, 'privacy_ci_user', true);
  insert into public.tracks(id, title, artist, genres, provider_ids, external_urls, available_on)
  values(v_track_id, 'Privacy Regression Track', 'KEEP CI', array['test'], '{}'::jsonb, '{}'::jsonb, array[]::text[]);

  insert into public.keep_decisions(profile_id, track_id, decision, visibility, source_type, created_at)
  values(uid, v_track_id, 'KEPT', 'PUBLIC', 'listen', now() - interval '2 minutes')
  returning id into v_decision_id;

  update public.keep_decisions
  set visibility='PRIVATE', created_at=now() - interval '1 minute'
  where id=v_decision_id;

  perform set_config('request.jwt.claim.sub', uid::text, true);

  select count(*) into private_count
  from public.keep_decisions kd
  where kd.profile_id=uid and kd.track_id=v_track_id and kd.decision='KEPT' and kd.visibility='PRIVATE';
  if private_count <> 1 then
    raise exception 'FAIL setup : décision PRIVATE canonique attendue 1, obtenu %', private_count;
  end if;

  -- La bibliothèque propriétaire garde la ligne PRIVATE pour l'anti-doublon.
  select count(*) into owner_rows
  from public.keep_own_profile_tracks(500,0) x
  where x.track_id = v_track_id;
  if owner_rows <> 1 then
    raise exception 'FAIL bibliothèque propriétaire : attend 1 ligne PRIVATE, obtenu %', owner_rows;
  end if;

  -- Mais la couche utilisée par l'écran Profil ne doit afficher aucun PRIVATE.
  select count(*) into owner_public_rows
  from public.keep_own_profile_tracks(500,0) x
  where x.track_id = v_track_id and x.visibility = 'PUBLIC';
  if owner_public_rows <> 0 then
    raise exception 'FAIL confidentialité propriétaire : % ligne(s) PRIVATE considérée(s) PUBLIC', owner_public_rows;
  end if;

  select count(*) into public_profile_rows
  from public.keep_public_profile_tracks(uid,500,0) x
  where x.track_id = v_track_id;
  if public_profile_rows <> 0 then
    raise exception 'FAIL confidentialité : profil public expose % ligne(s) PRIVATE', public_profile_rows;
  end if;

  select total_public_keeps into snapshot_public
  from public.keep_public_profile_snapshot(uid);
  if coalesce(snapshot_public,0) <> 0 then
    raise exception 'FAIL confidentialité : snapshot public compte encore le morceau PRIVATE (%)', snapshot_public;
  end if;

  raise notice 'OK PUBLIC -> PRIVÉ : piste owner-only, absente du RPC public et du snapshot';

  -- Retour PUBLIC : la même décision doit redevenir visible exactement une fois.
  update public.keep_decisions
  set visibility='PUBLIC', created_at=now()
  where id=v_decision_id;

  select count(*) into owner_rows
  from public.keep_own_profile_tracks(500,0) x
  where x.track_id = v_track_id and x.visibility = 'PUBLIC';
  if owner_rows <> 1 then
    raise exception 'FAIL retour PUBLIC : bibliothèque propriétaire attend 1 ligne PUBLIC, obtenu %', owner_rows;
  end if;

  select count(*) into public_profile_rows
  from public.keep_public_profile_tracks(uid,500,0) x
  where x.track_id = v_track_id;
  if public_profile_rows <> 1 then
    raise exception 'FAIL retour PUBLIC : profil public attend 1 ligne, obtenu %', public_profile_rows;
  end if;

  select total_public_keeps into snapshot_public
  from public.keep_public_profile_snapshot(uid);
  if coalesce(snapshot_public,0) <> 1 then
    raise exception 'FAIL retour PUBLIC : snapshot public attend 1, obtenu %', snapshot_public;
  end if;

  raise notice 'OK PRIVÉ -> PUBLIC : piste visible exactement une fois';
end;
$$;
SQL

echo "TEST CONFIDENTIALITÉ PROFIL KEEP : OK"
