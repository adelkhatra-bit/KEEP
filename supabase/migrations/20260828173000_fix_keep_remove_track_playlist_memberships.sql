-- A KEEP deletion must remove the track from every KEEP-owned playlist view.
-- Historical code compared added_via with lowercase 'keep' while the app writes
-- 'KEEP' / 'SOCIAL', leaving orphan playlist rows and preview buttons behind.

create or replace function public.keep_remove_track(p_track_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  removed integer := 0;
begin
  if uid is null then
    raise exception 'authentication_required';
  end if;

  delete from public.playlist_tracks pt
  using public.playlists p
  where pt.playlist_id = p.id
    and p.owner_id = uid
    and pt.track_id = p_track_id
    and upper(coalesce(pt.added_via, '')) in ('KEEP', 'SOCIAL');

  delete from public.keep_decisions
  where profile_id = uid
    and track_id = p_track_id
    and decision = 'KEPT';

  get diagnostics removed = row_count;
  return removed;
end;
$function$;
