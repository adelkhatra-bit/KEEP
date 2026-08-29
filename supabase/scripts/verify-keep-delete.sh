#!/usr/bin/env bash
# KEEP — test permanent suppression d'un morceau.
#
# Précondition : verify-migrations.sh a créé keep_verify_ci et appliqué toutes
# les migrations. Le scénario reproduit la boucle utilisateur complète côté
# données : morceau KEEP présent -> suppression -> plus aucune décision -> plus
# aucune apparition profil propriétaire -> plus aucune apparition profil public
# -> le crédit FREE déjà consommé reste consommé.
#
# Le contrat actuel garantit une seule décision KEPT canonique par profil/morceau.
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

echo "== Suppression KEEP : bibliothèque -> profil -> rechargement -> crédits =="
pg -d "$DB" <<'SQL'
\set ON_ERROR_STOP on

do $$
declare
  uid uuid := gen_random_uuid();
  v_track_id uuid := gen_random_uuid();
  v_playlist_id uuid := gen_random_uuid();
  removed int;
  remaining_decisions int;
  owner_rows int;
  public_rows int;
  playlist_rows int;
  credit_before int;
  credit_after int;
  remaining_before int;
  remaining_after int;
begin
  insert into auth.users(id) values(uid);
  insert into public.profiles(id, username, is_public) values(uid, 'delete_ci_user', true);
  insert into public.tracks(id, title, artist, genres, provider_ids, external_urls, available_on)
  values(v_track_id, 'Delete Regression Track', 'KEEP CI', array['test'], '{}'::jsonb, '{}'::jsonb, array[]::text[]);

  insert into public.keep_decisions(profile_id, track_id, decision, visibility, source_type, created_at)
  values(uid, v_track_id, 'KEPT', 'PUBLIC', 'listen', now() - interval '1 minute');

  -- Reproduit exactement l'association écrite par l'app : added_via='KEEP'.
  insert into public.playlists(id, owner_id, name, visibility)
  values(v_playlist_id, uid, 'Delete CI Playlist', 'PRIVATE');
  insert into public.playlist_tracks(playlist_id, track_id, position, added_via)
  values(v_playlist_id, v_track_id, 1, 'KEEP');

  -- Le crédit représente une consommation historique. Il ne doit jamais être
  -- recalculé à la baisse à partir du nombre de morceaux encore présents.
  insert into public.download_credit_usage(profile_id, consumed_count, updated_at)
  values(uid, 1, now());

  perform set_config('request.jwt.claim.sub', uid::text, true);

  if not exists (select 1 from public.keep_own_profile_tracks(500,0) x where x.track_id=v_track_id) then
    raise exception 'FAIL setup suppression : piste absente avant suppression';
  end if;

  select s.consumed, s.remaining into credit_before, remaining_before
  from public.keep_download_credit_status() s;
  if credit_before <> 1 then
    raise exception 'FAIL setup crédits : 1 crédit consommé attendu, obtenu %', credit_before;
  end if;

  select public.keep_remove_track(v_track_id) into removed;
  if removed <> 1 then
    raise exception 'FAIL suppression : 1 décision canonique attendue supprimée, obtenu %', removed;
  end if;

  select count(*) into remaining_decisions
  from public.keep_decisions kd
  where kd.profile_id=uid and kd.track_id=v_track_id and kd.decision='KEPT';
  if remaining_decisions <> 0 then
    raise exception 'FAIL suppression : % décision(s) KEEP restante(s)', remaining_decisions;
  end if;

  select count(*) into playlist_rows
  from public.playlist_tracks pt
  where pt.playlist_id=v_playlist_id and pt.track_id=v_track_id and upper(coalesce(pt.added_via,''))='KEEP';
  if playlist_rows <> 0 then
    raise exception 'FAIL suppression : % association(s) playlist KEEP restante(s)', playlist_rows;
  end if;

  -- Ces deux appels simulent le rechargement complet des sources profil.
  select count(*) into owner_rows
  from public.keep_own_profile_tracks(500,0) x
  where x.track_id=v_track_id;
  if owner_rows <> 0 then
    raise exception 'FAIL suppression : profil propriétaire recharge encore % ligne(s)', owner_rows;
  end if;

  select count(*) into public_rows
  from public.keep_public_profile_tracks(uid,500,0) x
  where x.track_id=v_track_id;
  if public_rows <> 0 then
    raise exception 'FAIL suppression : profil public recharge encore % ligne(s)', public_rows;
  end if;

  select s.consumed, s.remaining into credit_after, remaining_after
  from public.keep_download_credit_status() s;
  if credit_after <> credit_before then
    raise exception 'FAIL crédits : suppression a recrédité FREE (% -> % consommés)', credit_before, credit_after;
  end if;
  if remaining_after <> remaining_before then
    raise exception 'FAIL crédits : suppression a changé le solde restant (% -> %)', remaining_before, remaining_after;
  end if;

  raise notice 'OK suppression : décisions=0, playlist KEEP=0, profils=0, crédit consommé reste %', credit_after;
end;
$$;
SQL

echo "TEST SUPPRESSION KEEP + NON-REMBOURSEMENT CRÉDIT : OK"
