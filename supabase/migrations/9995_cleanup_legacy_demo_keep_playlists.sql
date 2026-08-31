with canonical as (
  select owner_id, id, name
  from public.playlists
  where provider = 'demo' and provider_playlist_id = 'keep-local-history'
), legacy as (
  select pl.id, pl.owner_id
  from public.playlists pl
  where pl.provider = 'demo'
    and pl.provider_playlist_id like 'demo-playlist-%'
    and lower(coalesce(pl.name, '')) = 'mes keep'
    and coalesce(pl.is_smart, false) = false
)
update public.keep_decisions kd
set chosen_playlist_id = c.id,
    context = jsonb_set(
      jsonb_set(coalesce(kd.context, '{}'::jsonb), '{playlist,providerPlaylistId}', to_jsonb('keep-local-history'::text), true),
      '{playlist,name}', to_jsonb(c.name), true
    )
from legacy l
join canonical c on c.owner_id = l.owner_id
where kd.chosen_playlist_id = l.id;

with canonical as (
  select owner_id, id
  from public.playlists
  where provider = 'demo' and provider_playlist_id = 'keep-local-history'
), legacy as (
  select pl.id, pl.owner_id
  from public.playlists pl
  where pl.provider = 'demo'
    and pl.provider_playlist_id like 'demo-playlist-%'
    and lower(coalesce(pl.name, '')) = 'mes keep'
    and coalesce(pl.is_smart, false) = false
)
insert into public.playlist_tracks(playlist_id, track_id, added_at, added_via)
select c.id, pt.track_id, pt.added_at, pt.added_via
from legacy l
join canonical c on c.owner_id = l.owner_id
join public.playlist_tracks pt on pt.playlist_id = l.id
on conflict (playlist_id, track_id) do update
set added_at = least(public.playlist_tracks.added_at, excluded.added_at),
    added_via = case
      when public.playlist_tracks.added_via = 'SOCIAL' or excluded.added_via = 'SOCIAL' then 'SOCIAL'
      else public.playlist_tracks.added_via
    end;

delete from public.playlists pl
where pl.provider = 'demo'
  and pl.provider_playlist_id like 'demo-playlist-%'
  and lower(coalesce(pl.name, '')) = 'mes keep'
  and coalesce(pl.is_smart, false) = false
  and exists (
    select 1
    from public.playlists c
    where c.owner_id = pl.owner_id
      and c.provider = 'demo'
      and c.provider_playlist_id = 'keep-local-history'
  );
