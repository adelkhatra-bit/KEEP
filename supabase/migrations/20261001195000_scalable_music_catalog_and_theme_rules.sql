-- Scalable catalog growth + automatic Solo/Battle taxonomy.
-- Every successful recognition can enter public.tracks once, deduplicated,
-- then this trigger classifies the track into all matching Battle/Solo themes.

insert into public.keep_battle_themes(code,label,enabled,sort_order) values
  ('DANCE','Dance',true,56),
  ('WORLD','World',true,57),
  ('HIPHOP','Hip-Hop',true,58),
  ('SERTANEJO','Sertanejo',true,106),
  ('ARABIC_POP','Arabic Pop',true,107),
  ('EGYPTIAN_POP','Egyptian Pop',true,108),
  ('KHALEEJI','Khaleeji',true,109),
  ('AFROPOP','Afro Pop',true,110),
  ('AFRO_FUSION','Afro Fusion',true,111),
  ('BAILE_FUNK','Baile Funk',true,112),
  ('PAGODE','Pagode',true,113),
  ('HARD_ROCK','Hard Rock',true,114),
  ('INDIE','Indie',true,115),
  ('LATIN_POP','Latin Pop',true,116),
  ('MEXICAN','Musique mexicaine',true,117),
  ('TROPICAL','Tropical',true,118),
  ('FOLK','Folk',true,119),
  ('VOCAL','Vocal',true,120),
  ('SINGER_SONGWRITER','Auteur-compositeur',true,121),
  ('INSTRUMENTAL','Instrumental',true,122),
  ('AMBIENT','Ambient',true,123),
  ('NEW_AGE','New Age',true,124),
  ('CHRISTMAS','Noël',true,125),
  ('ANNEES_60','Années 60',true,130),
  ('ANNEES_70','Années 70',true,131),
  ('ANNEES_2000','Années 2000',true,132),
  ('ANNEES_2010','Années 2010',true,133),
  ('ANNEES_2020','Années 2020',true,134)
on conflict(code) do update
set label=excluded.label, enabled=true, sort_order=excluded.sort_order, updated_at=now();

create table if not exists public.keep_battle_theme_rules (
  id bigserial primary key,
  theme_code text not null references public.keep_battle_themes(code) on delete cascade,
  genre_pattern text,
  match_mode text not null default 'EXACT' check (match_mode in ('EXACT','CONTAINS')),
  release_year_min smallint,
  release_year_max smallint,
  confidence numeric not null default 0.95 check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now(),
  check (genre_pattern is not null or release_year_min is not null or release_year_max is not null)
);

create unique index if not exists keep_battle_theme_rules_unique_genre
on public.keep_battle_theme_rules(theme_code,lower(coalesce(genre_pattern,'')),match_mode,
  coalesce(release_year_min::integer,-32768),coalesce(release_year_max::integer,32767));

alter table public.keep_battle_theme_rules enable row level security;
drop policy if exists keep_battle_theme_rules_read on public.keep_battle_theme_rules;
create policy keep_battle_theme_rules_read on public.keep_battle_theme_rules for select using (true);

insert into public.keep_battle_theme_rules(theme_code,genre_pattern,match_mode,confidence) values
  ('DANCE','dance','EXACT',0.98),('DANCE','house','EXACT',0.92),('DANCE','breakbeat','EXACT',0.92),
  ('WORLD','musiques du monde','EXACT',0.98),('WORLD','worldwide','EXACT',0.95),('WORLD','african','EXACT',0.88),
  ('HIPHOP','hip-hop/rap','EXACT',0.98),('HIPHOP','rap','EXACT',0.94),('HIPHOP','хип-хоп','EXACT',0.94),
  ('SERTANEJO','sertanejo','EXACT',0.99),
  ('ARABIC_POP','arabic pop','EXACT',0.99),('ARABIC_POP','pop arabe','EXACT',0.99),('ARABIC_POP','arabic','EXACT',0.90),
  ('EGYPTIAN_POP','egyptian pop','EXACT',0.99),
  ('KHALEEJI','khaleeji','EXACT',0.99),
  ('AFROPOP','afro pop','CONTAINS',0.96),('AFROPOP','afro-pop','EXACT',0.96),
  ('AFRO_FUSION','afro-fusion','EXACT',0.99),
  ('BAILE_FUNK','baile funk','EXACT',0.99),
  ('PAGODE','pagode','EXACT',0.99),
  ('HARD_ROCK','hard rock','EXACT',0.99),
  ('INDIE','indie rock','EXACT',0.98),('INDIE','pop indé','EXACT',0.98),('INDIE','인디 록','EXACT',0.98),
  ('LATIN_POP','pop latino','EXACT',0.99),('LATIN_POP','pop en espagnol','EXACT',0.92),
  ('MEXICAN','música mexicana','EXACT',0.99),
  ('TROPICAL','música tropical','EXACT',0.99),
  ('FOLK','folk','EXACT',0.99),('FOLK','포크','EXACT',0.98),
  ('VOCAL','vocal','EXACT',0.99),('VOCAL','vocal pop','EXACT',0.95),
  ('SINGER_SONGWRITER','singer/songwriter','EXACT',0.99),
  ('INSTRUMENTAL','instrumental','EXACT',0.99),
  ('AMBIENT','ambient','EXACT',0.99),
  ('NEW_AGE','new age','EXACT',0.99),
  ('CHRISTMAS','holiday','EXACT',0.94),('CHRISTMAS','noël','CONTAINS',0.98),('CHRISTMAS','christmas','CONTAINS',0.98)
on conflict do nothing;

insert into public.keep_battle_theme_rules(theme_code,release_year_min,release_year_max,confidence) values
  ('ANNEES_60',1960,1969,1),
  ('ANNEES_70',1970,1979,1),
  ('ANNEES_2000',2000,2009,1),
  ('ANNEES_2010',2010,2019,1),
  ('ANNEES_2020',2020,2029,1)
on conflict do nothing;

create or replace function public.keep_apply_battle_theme_rules_for_track(p_track_id uuid)
returns integer
language plpgsql
security definer
set search_path=public
as $function$
declare v_count integer := 0;
begin
  delete from public.keep_battle_track_themes
  where track_id=p_track_id and source='AUTO_RULE';

  insert into public.keep_battle_track_themes(track_id,theme_code,source,confidence)
  select distinct t.id,r.theme_code,'AUTO_RULE',r.confidence
  from public.tracks t
  join public.keep_battle_theme_rules r on (
    (
      r.genre_pattern is not null and exists (
        select 1 from unnest(coalesce(t.genres,array[]::text[])) g
        where case r.match_mode
          when 'CONTAINS' then lower(trim(g)) like '%' || lower(trim(r.genre_pattern)) || '%'
          else lower(trim(g)) = lower(trim(r.genre_pattern))
        end
      )
    )
    or (
      r.genre_pattern is null
      and (r.release_year_min is null or t.release_year >= r.release_year_min)
      and (r.release_year_max is null or t.release_year <= r.release_year_max)
    )
  )
  where t.id=p_track_id
  on conflict(track_id,theme_code) do update
  set confidence=greatest(public.keep_battle_track_themes.confidence,excluded.confidence);

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.keep_apply_battle_theme_rules_for_track(uuid) from public, anon;
grant execute on function public.keep_apply_battle_theme_rules_for_track(uuid) to authenticated, service_role;

create or replace function public.keep_tracks_auto_theme_trigger()
returns trigger language plpgsql security definer set search_path=public
as $function$
begin
  perform public.keep_apply_battle_theme_rules_for_track(new.id);
  return new;
end;
$function$;

drop trigger if exists trg_tracks_auto_theme on public.tracks;
create trigger trg_tracks_auto_theme
after insert or update of genres,release_year on public.tracks
for each row execute function public.keep_tracks_auto_theme_trigger();

select public.keep_apply_battle_theme_rules_for_track(id) from public.tracks;

create or replace function public.service_catalog_track_from_recognition(
  p_title text,
  p_artist text,
  p_isrc text default null,
  p_album text default null,
  p_artwork_url text default null,
  p_preview_url text default null,
  p_provider_ids jsonb default '{}'::jsonb,
  p_external_urls jsonb default '{}'::jsonb,
  p_available_on text[] default '{}'::text[],
  p_genres text[] default '{}'::text[],
  p_release_year smallint default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_id uuid;
  v_title text := nullif(trim(coalesce(p_title,'')),'');
  v_artist text := nullif(trim(coalesce(p_artist,'')),'');
  v_isrc text := nullif(upper(trim(coalesce(p_isrc,''))),'');
begin
  if v_title is null or v_artist is null then return null; end if;

  if v_isrc is not null then
    select id into v_id from public.tracks where isrc=v_isrc limit 1;
  end if;

  if v_id is null and nullif(p_provider_ids->>'appleMusic','') is not null then
    select id into v_id from public.tracks where provider_ids->>'appleMusic'=p_provider_ids->>'appleMusic' limit 1;
  end if;
  if v_id is null and nullif(p_provider_ids->>'spotify','') is not null then
    select id into v_id from public.tracks where provider_ids->>'spotify'=p_provider_ids->>'spotify' limit 1;
  end if;
  if v_id is null and nullif(p_provider_ids->>'deezer','') is not null then
    select id into v_id from public.tracks where provider_ids->>'deezer'=p_provider_ids->>'deezer' limit 1;
  end if;

  if v_id is null then
    select id into v_id from public.tracks
    where public.keep_track_identity(title,artist)=public.keep_track_identity(v_title,v_artist)
    order by created_at asc limit 1;
  end if;

  if v_id is not null then
    update public.tracks set
      isrc=coalesce(isrc,v_isrc),
      album=coalesce(album,nullif(trim(coalesce(p_album,'')),'')),
      artwork_url=coalesce(artwork_url,nullif(trim(coalesce(p_artwork_url,'')),'')),
      preview_url=coalesce(preview_url,nullif(trim(coalesce(p_preview_url,'')),'')),
      provider_ids=coalesce(provider_ids,'{}'::jsonb) || coalesce(p_provider_ids,'{}'::jsonb),
      external_urls=coalesce(external_urls,'{}'::jsonb) || coalesce(p_external_urls,'{}'::jsonb),
      available_on=array(select distinct x from unnest(coalesce(available_on,'{}'::text[]) || coalesce(p_available_on,'{}'::text[])) x where nullif(trim(x),'') is not null),
      genres=array(select distinct x from unnest(coalesce(genres,'{}'::text[]) || coalesce(p_genres,'{}'::text[])) x where nullif(trim(x),'') is not null),
      release_year=coalesce(release_year,p_release_year),
      source=coalesce(source,'recognition')
    where id=v_id;
    return v_id;
  end if;

  begin
    insert into public.tracks(
      isrc,title,artist,album,artwork_url,preview_url,genres,provider_ids,external_urls,available_on,release_year,source
    ) values(
      v_isrc,v_title,v_artist,nullif(trim(coalesce(p_album,'')),''),
      nullif(trim(coalesce(p_artwork_url,'')),''),nullif(trim(coalesce(p_preview_url,'')),''),
      coalesce(p_genres,'{}'::text[]),coalesce(p_provider_ids,'{}'::jsonb),
      coalesce(p_external_urls,'{}'::jsonb),coalesce(p_available_on,'{}'::text[]),p_release_year,'recognition'
    ) returning id into v_id;
    return v_id;
  exception when unique_violation then
    select id into v_id from public.tracks
    where (v_isrc is not null and isrc=v_isrc)
       or public.keep_track_identity(title,artist)=public.keep_track_identity(v_title,v_artist)
    order by created_at asc limit 1;
    return v_id;
  end;
end;
$function$;

revoke all on function public.service_catalog_track_from_recognition(text,text,text,text,text,text,jsonb,jsonb,text[],text[],smallint) from public, anon, authenticated;
grant execute on function public.service_catalog_track_from_recognition(text,text,text,text,text,text,jsonb,jsonb,text[],text[],smallint) to service_role;
