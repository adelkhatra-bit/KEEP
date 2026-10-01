-- Expand Solo/Battle with styles that already have a real playable catalog.
insert into public.keep_battle_themes(code,label,enabled,sort_order)
values
  ('ALTERNATIVE','Alternative',true,55),
  ('DANCE','Dance',true,56),
  ('WORLD','World',true,57),
  ('SOUNDTRACK','Bandes originales',true,58),
  ('SERTANEJO','Sertanejo',true,106)
on conflict(code) do update
set label=excluded.label, enabled=true, sort_order=excluded.sort_order, updated_at=now();

with genre_tracks as (
  select distinct t.id as track_id, lower(trim(g)) as genre
  from public.tracks t
  cross join lateral unnest(coalesce(t.genres,array[]::text[])) g
  where nullif(trim(g),'') is not null
)
insert into public.keep_battle_track_themes(track_id,theme_code,source,confidence)
select track_id,'ALTERNATIVE','GENRE_MAP',0.95 from genre_tracks where genre in ('alternative','indie rock','pop indé','인디 록')
on conflict(track_id,theme_code) do nothing;

with genre_tracks as (
  select distinct t.id as track_id, lower(trim(g)) as genre
  from public.tracks t
  cross join lateral unnest(coalesce(t.genres,array[]::text[])) g
  where nullif(trim(g),'') is not null
)
insert into public.keep_battle_track_themes(track_id,theme_code,source,confidence)
select track_id,'DANCE','GENRE_MAP',0.95 from genre_tracks where genre in ('dance','house','breakbeat')
on conflict(track_id,theme_code) do nothing;

with genre_tracks as (
  select distinct t.id as track_id, lower(trim(g)) as genre
  from public.tracks t
  cross join lateral unnest(coalesce(t.genres,array[]::text[])) g
  where nullif(trim(g),'') is not null
)
insert into public.keep_battle_track_themes(track_id,theme_code,source,confidence)
select track_id,'WORLD','GENRE_MAP',0.95 from genre_tracks where genre in ('musiques du monde','worldwide','african')
on conflict(track_id,theme_code) do nothing;

with genre_tracks as (
  select distinct t.id as track_id, lower(trim(g)) as genre
  from public.tracks t
  cross join lateral unnest(coalesce(t.genres,array[]::text[])) g
  where nullif(trim(g),'') is not null
)
insert into public.keep_battle_track_themes(track_id,theme_code,source,confidence)
select track_id,'SOUNDTRACK','GENRE_MAP',0.95 from genre_tracks where genre in ('bande originale','soundtrack')
on conflict(track_id,theme_code) do nothing;

with genre_tracks as (
  select distinct t.id as track_id, lower(trim(g)) as genre
  from public.tracks t
  cross join lateral unnest(coalesce(t.genres,array[]::text[])) g
  where nullif(trim(g),'') is not null
)
insert into public.keep_battle_track_themes(track_id,theme_code,source,confidence)
select track_id,'SERTANEJO','GENRE_MAP',0.95 from genre_tracks where genre='sertanejo'
on conflict(track_id,theme_code) do nothing;
