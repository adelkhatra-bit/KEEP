-- Country-matched Solo: a French category must not ask US/Arabic names.
-- Only verified origins count. Unknown nationality is never guessed.
-- The same server SQL is used by both iPhone and desktop.
insert into public.keep_solo_artist_countries(artist_key,country_code,provenance)
values
  ('alain chamfort','FR','editorial-curation'),
  ('alain bashung','FR','editorial-curation'),
  ('étienne daho','FR','editorial-curation'),
  ('julie pietri','FR','editorial-curation'),
  ('julie piétri','FR','editorial-curation'),
  ('françoise hardy','FR','editorial-curation'),
  ('les forbans','FR','editorial-curation'),
  ('marc lavoine','FR','editorial-curation'),
  ('françois feldman','FR','editorial-curation'),
  ('jeanne mas','FR','editorial-curation'),
  ('desireless','FR','editorial-curation'),
  ('patrick fiori','FR','editorial-curation'),
  ('début de soirée','FR','editorial-curation'),
  ('jean-pierre mader','FR','editorial-curation'),
  ('grand corps malade','FR','editorial-curation'),
  ('luna parker','FR','editorial-curation'),
  ('sheila','FR','editorial-curation'),
  ('cookie dingler','FR','editorial-curation'),
  ('sexion d''assaut','FR','editorial-curation'),
  ('camille','FR','editorial-curation'),
  ('gilbert bécaud','FR','editorial-curation'),
  ('images','FR','editorial-curation'),
  ('les enfoirés','FR','editorial-curation'),
  ('tayc','FR','editorial-curation'),
  ('téléphone','FR','editorial-curation'),
  ('sacha distel','FR','editorial-curation'),
  ('pierre bachelet','FR','editorial-curation'),
  ('elsa','FR','editorial-curation'),
  ('michel jonasz','FR','editorial-curation'),
  ('les compagnons de la chanson','FR','editorial-curation'),
  ('louis chedid','FR','editorial-curation'),
  ('julien doré','FR','editorial-curation'),
  ('therapie taxi','FR','editorial-curation'),
  ('timal','FR','editorial-curation'),
  ('henri salvador','FR','editorial-curation'),
  ('sanseverino','FR','editorial-curation'),
  ('francis lemarque','FR','editorial-curation'),
  ('brigitte','FR','editorial-curation'),
  ('philippe lavil','FR','editorial-curation'),
  ('nicoletta','FR','editorial-curation'),
  ('chimène badi','FR','editorial-curation'),
  ('emile & images','FR','editorial-curation'),
  ('kyo','FR','editorial-curation'),
  ('boulevard des airs','FR','editorial-curation'),
  ('keblack','FR','editorial-curation'),
  ('laroche valmont','FR','editorial-curation')
on conflict(artist_key) do nothing;

-- Keep previous SECDEF safeguards, existing 4-option shape, FREE and memory.
CREATE OR REPLACE FUNCTION public.keep_battle_solo_pack(p_theme_code text DEFAULT 'MIX'::text, p_round_count integer DEFAULT 8, p_theme_codes text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_round_count integer := greatest(5,least(coalesce(p_round_count,8),30));
  v_label text := upper(trim(coalesce(p_theme_code,'MIX')));
  v_themes text[];
  v_recent_tracks uuid[] := array[]::uuid[];
  v_recent_artists text[] := array[]::text[];
  v_rounds jsonb;
  v_pool_ids uuid[];
begin
  if v_label='' then v_label:='MIX'; end if;
  select array_agg(code order by first_ord) into v_themes
  from (select upper(trim(code)) as code,min(ord) as first_ord
    from unnest(coalesce(p_theme_codes,array[]::text[])) with ordinality u(code,ord)
    where upper(trim(coalesce(code,''))) not in ('','MIX')
    group by upper(trim(code)) order by min(ord) limit 3) chosen;
  if v_themes is null and v_label<>'MIX' then v_themes:=array[v_label]; end if;
  if v_themes is not null and exists (select 1 from unnest(v_themes) c
    where not exists(select 1 from public.keep_battle_themes t where t.code=c and t.enabled=true)) then
    raise exception 'BATTLE_THEME_UNAVAILABLE';
  end if;
  if v_themes is not null and cardinality(v_themes)>1 then v_label:='MIX'; end if;
  if v_uid is not null then
    select coalesce(recent_track_ids,array[]::uuid[]),coalesce(recent_artist_keys,array[]::text[])
      into v_recent_tracks,v_recent_artists from public.keep_battle_content_memory where profile_id=v_uid;
  end if;
  -- Pool élargi pour garantir 4 artistes distincts de même pays, style et époque quand leurs origines sont vérifiées.
  if v_themes is null then
    select array_agg(id) into v_pool_ids from (
      select s.id from public.tracks s tablesample system (7)
      where nullif(trim(s.preview_url),'') is not null and nullif(trim(s.title),'') is not null and nullif(trim(s.artist),'') is not null
      order by random() limit 850) x;
  else
    select array_agg(track_id) into v_pool_ids from (
      select m.track_id from (select distinct m0.track_id from public.keep_battle_track_themes m0 where m0.theme_code = any(v_themes)) m
      order by random() limit 850) x;
  end if;
  -- Repli : petit échantillon -> ancienne méthode exhaustive.
  if coalesce(cardinality(v_pool_ids),0) < 60 then
    select array_agg(id) into v_pool_ids from (
      select t0.id from public.tracks t0
      where nullif(trim(t0.preview_url),'') is not null and nullif(trim(t0.title),'') is not null and nullif(trim(t0.artist),'') is not null
        and (v_themes is null or exists (select 1 from public.keep_battle_track_themes m0 where m0.track_id=t0.id and m0.theme_code=any(v_themes)))
      order by random() limit 850) x;
  end if;
  with theme_list as (
    select upper(trim(code)) as code,ord::integer as theme_ord from unnest(coalesce(v_themes,array[]::text[])) with ordinality u(code,ord)
  ),
  pool as (
    select t.id,t.title,t.artist,t.artwork_url,t.preview_url,t.release_year,t.genres, country.country_code, chosen.theme_code, chosen.theme_ord,
      case when t.id=any(v_recent_tracks) then 1 else 0 end as recent_penalty, random() as rnd
    from (select t0.* from public.tracks t0 where t0.id = any(coalesce(v_pool_ids, array[]::uuid[]))
        and nullif(trim(t0.preview_url),'') is not null and nullif(trim(t0.title),'') is not null and nullif(trim(t0.artist),'') is not null) t
    left join public.keep_solo_artist_countries country on country.artist_key=lower(trim(t.artist))
    left join lateral (select tl.code as theme_code,tl.theme_ord from theme_list tl
      join public.keep_battle_track_themes m on m.track_id=t.id and m.theme_code=tl.code order by tl.theme_ord limit 1) chosen on true
    where (v_themes is null or chosen.theme_code is not null)
      and (v_uid is null or not exists (select 1 from public.playlists pl join public.playlist_tracks pt on pt.playlist_id=pl.id where pl.owner_id=v_uid and pt.track_id=t.id))
  ),
  artist_dedup as (select * from (select p.*, row_number() over(partition by lower(trim(p.artist)) order by p.recent_penalty,p.rnd) as artist_rn from pool p) x where x.artist_rn=1),
  ranked as (select d.*, count(*) over(partition by d.country_code) as country_pool_count,
      case when v_themes is null then 1 else row_number() over(partition by d.theme_code order by d.recent_penalty,d.rnd) end as theme_rank from artist_dedup d),
  -- Only ask a nationality-tagged question if at least 3 matching false answers exist.
  candidates as (select * from ranked where country_pool_count>=4
       and (theme_code is null
         or theme_code not in ('CHANSON_FR','RAP_FR','RAP_US')
         or (theme_code in ('CHANSON_FR','RAP_FR') and country_code='FR')
         or (theme_code='RAP_US' and country_code='US'))
     order by case when country_code is not null then 0 else 1 end,
       case when v_themes is null then recent_penalty else theme_rank end,
       case when v_themes is null then 1 else theme_ord end, recent_penalty, rnd limit v_round_count),
  packed as (select row_number() over(order by case when v_themes is null then recent_penalty else theme_rank end, case when v_themes is null then 1 else theme_ord end, rnd)::integer as position,
      c.id,c.title,c.artist,c.artwork_url,c.preview_url,c.release_year,c.genres,c.country_code, coalesce(c.theme_code,'MIX') as theme_code from candidates c),
  -- Pas de leurres venant d'un autre pays lorsque l'origine de l'artiste est connue.
  -- Pays inconnu : comparaisons uniquement entre autres artistes de pays inconnus;
  -- ne pas inventer une nationalité à partir de la langue ou de l'ISRC.
  distractors as (select artist,release_year,genres,theme_code,country_code from artist_dedup),
  with_choices as (select p.*, coalesce((select jsonb_agg(value order by random()) from (select p.artist::text as value union all
          select d.artist from (select d.artist from distractors d
            where lower(trim(d.artist))<>lower(trim(p.artist))
              and d.country_code is not distinct from p.country_code
            order by case when d.theme_code=p.theme_code then 0 else 1 end,
              case when d.genres && p.genres then 0 else 1 end,
              case when p.release_year is not null and d.release_year is not null and abs(p.release_year::integer-d.release_year::integer)<=6 then 0 else 1 end,
              case when p.release_year is not null and d.release_year is not null then abs(p.release_year::integer-d.release_year::integer) else 99 end,
              case when lower(trim(d.artist))=any(v_recent_artists) then 1 else 0 end,
              random() limit 3) d) options),'[]'::jsonb) as choices from packed p)
  select jsonb_agg(jsonb_build_object('position',x.position,'trackId',x.id,'title',x.title,'artist',x.artist,'artworkUrl',x.artwork_url,
      'previewUrl',x.preview_url,'releaseYear',x.release_year,'themeCode',x.theme_code,'choices',x.choices,'correctAnswer',x.artist) order by x.position)
  into v_rounds from with_choices x where jsonb_array_length(x.choices)=4;
  if jsonb_array_length(coalesce(v_rounds,'[]'::jsonb))<5 then
    raise exception 'BATTLE_THEME_CATALOG_TOO_SMALL:%',coalesce(array_to_string(v_themes,'+'),v_label);
  end if;
  if v_uid is not null then
    perform public.keep_battle_remember_content(array[v_uid], array(select (r->>'trackId')::uuid from jsonb_array_elements(v_rounds) r),
      array(select c.choice_value from jsonb_array_elements(v_rounds) r cross join lateral jsonb_array_elements_text(r->'choices') c(choice_value)));
  end if;
  return jsonb_build_object('mode','SOLO_TRAINING','themeCode',v_label,'themeCodes',to_jsonb(coalesce(v_themes,array['MIX']::text[])),
    'roundCount',jsonb_array_length(v_rounds),'stakeFree',0,'rewardFree',0,'rounds',v_rounds);
end;
$function$
