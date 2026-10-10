-- Worldwide music preferences and taxonomy cache.
alter table public.profiles
  add column if not exists preferred_language_tag text,
  add column if not exists music_country_codes text[] not null default '{}';

create table if not exists public.music_genre_catalog (
  genre_key text primary key,
  label text not null,
  source text not null default 'MUSICBRAINZ',
  track_count integer not null default 0,
  is_featured boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.music_genre_catalog enable row level security;
drop policy if exists music_genre_catalog_read on public.music_genre_catalog;
create policy music_genre_catalog_read on public.music_genre_catalog for select using (true);

create table if not exists public.music_country_catalog (
  code text primary key check (code ~ '^[A-Z]{2}$'),
  name text not null,
  language_codes text[] not null default '{}',
  source text not null default 'RESTCOUNTRIES',
  updated_at timestamptz not null default now()
);
alter table public.music_country_catalog enable row level security;
drop policy if exists music_country_catalog_read on public.music_country_catalog;
create policy music_country_catalog_read on public.music_country_catalog for select using (true);

insert into public.music_genre_catalog(genre_key,label,source,track_count,is_featured)
select
  lower(regexp_replace(trim(g), '\s+', ' ', 'g')),
  min(trim(g)),
  'TRACKS',
  count(*)::integer,
  count(*) >= 20
from public.tracks t
cross join lateral unnest(coalesce(t.genres,array[]::text[])) g
where nullif(trim(g),'') is not null
group by lower(regexp_replace(trim(g), '\s+', ' ', 'g'))
on conflict(genre_key) do update
set track_count=excluded.track_count,
    is_featured=public.music_genre_catalog.is_featured or excluded.is_featured,
    updated_at=now();

create or replace function public.keep_music_genre_search(p_query text default null, p_limit integer default 80)
returns table(genre_key text,label text,track_count integer,is_featured boolean)
language sql stable security definer set search_path=public
as $function$
  select g.genre_key,g.label,g.track_count,g.is_featured
  from public.music_genre_catalog g
  where nullif(trim(coalesce(p_query,'')),'') is null
     or g.label ilike '%' || trim(p_query) || '%'
     or g.genre_key ilike '%' || lower(trim(p_query)) || '%'
  order by
    case when nullif(trim(coalesce(p_query,'')),'') is not null and lower(g.label)=lower(trim(p_query)) then 0
         when nullif(trim(coalesce(p_query,'')),'') is not null and lower(g.label) like lower(trim(p_query)) || '%' then 1
         else 2 end,
    g.is_featured desc,g.track_count desc,g.label
  limit greatest(10,least(coalesce(p_limit,80),300));
$function$;

revoke all on function public.keep_music_genre_search(text,integer) from public,anon;
grant execute on function public.keep_music_genre_search(text,integer) to authenticated,anon;

create or replace function public.keep_music_country_search(p_query text default null, p_limit integer default 300)
returns table(code text,name text,language_codes text[])
language sql stable security definer set search_path=public
as $function$
  select c.code,c.name,c.language_codes
  from public.music_country_catalog c
  where nullif(trim(coalesce(p_query,'')),'') is null
     or c.name ilike '%' || trim(p_query) || '%'
     or c.code ilike '%' || upper(trim(p_query)) || '%'
  order by c.name
  limit greatest(10,least(coalesce(p_limit,300),300));
$function$;

revoke all on function public.keep_music_country_search(text,integer) from public,anon;
grant execute on function public.keep_music_country_search(text,integer) to authenticated,anon;
