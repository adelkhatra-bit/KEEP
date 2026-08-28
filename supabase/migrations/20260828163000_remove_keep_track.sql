-- KEEP — suppression réelle d'un morceau de la bibliothèque utilisateur.
-- Toutes les décisions historiques sont supprimées afin qu'aucune ancienne
-- décision PUBLIC ne puisse refaire apparaître le morceau sur le profil.

create or replace function public.keep_remove_track(p_track_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  removed integer := 0;
begin
  if uid is null then
    raise exception 'authentication_required';
  end if;

  -- Retire uniquement les associations créées par KEEP dans les playlists
  -- appartenant au compte. Les playlists externes Spotify/Apple ne sont jamais
  -- modifiées silencieusement par cette opération.
  delete from public.playlist_tracks pt
  using public.playlists p
  where pt.playlist_id = p.id
    and p.owner_id = uid
    and pt.track_id = p_track_id
    and pt.added_via = 'keep';

  delete from public.keep_decisions
  where profile_id = uid
    and track_id = p_track_id
    and decision = 'KEPT';

  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.keep_remove_track(uuid) from public;
grant execute on function public.keep_remove_track(uuid) to authenticated;
