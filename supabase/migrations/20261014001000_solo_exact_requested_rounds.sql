-- Solo exact pack size, all styles, after curated-origin / no-duplicate migration.
-- Fix: previous SQL selected precisely 8 candidates before validating four
-- distinct displayed artists; invalid ones were removed, returning 7/8.
-- This now overselects valid candidates, filters, truncates to the chosen
-- 8/15/20/30, renumbers contiguous positions, or raises a recoverable
-- insufficient-catalogue error before committing the pack to player memory.
-- No change to quotas, rewards, country verification, privacy or FREE.
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
  v_theme_country text;
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
  -- Never offer an American or Arabic singer against a specifically French
  -- round. Country-specific themes require verified country, not language
  -- or a guessed ISRC registration territory. MIX interleaves countries.
  if coalesce(cardinality(v_themes),0)=1 then
    v_theme_country := case v_themes[1]
      when 'CHANSON_FR' then 'FR' when 'RAP_FR' then 'FR'
      when 'RAP_US' then 'US' when 'KPOP' then 'KR'
      when 'JPOP' then 'JP' when 'EGYPTIAN_POP' then 'EG'
      else null end;
  end if;
  if v_uid is not null then
    select coalesce(recent_track_ids,array[]::uuid[]),coalesce(recent_artist_keys,array[]::text[])
      into v_recent_tracks,v_recent_artists from public.keep_battle_content_memory where profile_id=v_uid;
  end if;
  -- Pool élargi pour garantir 4 artistes distincts de même pays, style et époque quand leurs origines sont vérifiées.
  if v_themes is null then
    -- MIX: the old 850-track sample overrepresented hit artists and could
    -- offer one French name among unrelated English/Arabic names. Sample
    -- from ALL verified countries, then add 2400 more playable catalogue
    -- tracks to increase song and artist diversity across future sessions.
    select array_agg(id) into v_pool_ids from (
      select known.id from (
        select distinct on (lower(trim(t.artist))) t.id,t.artist
        from public.tracks t
        join public.keep_solo_artist_countries c on c.artist_key=lower(trim(t.artist))
        where nullif(trim(t.preview_url),'') is not null
          and nullif(trim(t.title),'') is not null
        order by lower(trim(t.artist)),random() limit 1500
      ) known
      union
      select sampled.id from (
        select t.id from public.tracks t tablesample system (16)
        where nullif(trim(t.preview_url),'') is not null
          and nullif(trim(t.title),'') is not null
          and nullif(trim(t.artist),'') is not null
        order by random() limit 2400
      ) sampled
    ) x;
  else
    select array_agg(track_id) into v_pool_ids from (
      select m.track_id from (select distinct m0.track_id from public.keep_battle_track_themes m0 where m0.theme_code = any(v_themes)) m
      order by random() limit 2800) x;
  end if;
  -- Repli : petit échantillon -> ancienne méthode exhaustive.
  if coalesce(cardinality(v_pool_ids),0) < 60 then
    select array_agg(id) into v_pool_ids from (
      select t0.id from public.tracks t0
      where nullif(trim(t0.preview_url),'') is not null and nullif(trim(t0.title),'') is not null and nullif(trim(t0.artist),'') is not null
        and (v_themes is null or exists (select 1 from public.keep_battle_track_themes m0 where m0.track_id=t0.id and m0.theme_code=any(v_themes)))
      order by random() limit 2800) x;
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
  artist_dedup as (
    select * from (
      select p.*, regexp_replace(translate(lower(trim(p.artist)),'àáâäãåçèéêëìíîïñòóôöõùúûüýÿ','aaaaaaceeeeiiiinooooouuuuyy'),'[^[:alnum:]]','','g') as normalized_artist,
        regexp_replace(translate(lower(trim(split_part(split_part(split_part(split_part(p.artist,'&',1),',',1),'/',1),'+',1))),'àáâäãåçèéêëìíîïñòóôöõùúûüýÿ','aaaaaaceeeeiiiinooooouuuuyy'),'[^[:alnum:]]','','g') as display_artist_key,
        row_number() over(partition by regexp_replace(translate(lower(trim(split_part(split_part(split_part(split_part(p.artist,'&',1),',',1),'/',1),'+',1))),'àáâäãåçèéêëìíîïñòóôöõùúûüýÿ','aaaaaaceeeeiiiinooooouuuuyy'),'[^[:alnum:]]','','g') order by p.recent_penalty,p.rnd) as artist_rn
      from pool p
    ) x where x.artist_rn=1 and nullif(x.normalized_artist,'') is not null
  ),
  ranked as (
    select d.*,
      count(*) over(partition by d.country_code) as country_pool_count,
      row_number() over(partition by d.country_code order by d.recent_penalty,d.rnd) as country_rank,
      case when v_themes is null then 1 else row_number() over(partition by d.theme_code order by d.recent_penalty,d.rnd) end as theme_rank
    from artist_dedup d
  ),
  -- Only ask a nationality-tagged question if at least 3 matching false answers exist.
  candidates as (
    select * from ranked
    where country_pool_count>=4
      and (v_theme_country is null or country_code=v_theme_country)
      and (v_themes is not null or country_code is not null)
      -- CHANSON_FR must not accidentally ask about rap / Arabic / K-pop
      -- recordings that were mislabelled by upstream genre inference.
      and (v_themes is distinct from array['CHANSON_FR']::text[]
        or lower(array_to_string(genres,' ')) !~ '(^|[^a-z])(hip.hop|rap|arabic|arabe|k.pop|latin urban)([^a-z]|$)')
    order by case when v_themes is null then country_rank else 0 end,
      recent_penalty,case when v_themes is null then 1 else theme_rank end,
      case when v_themes is null then 1 else theme_ord end,rnd
    -- Pick extra eligible artists because four-answer and featured-credit
    -- validation can discard some candidates. Never silently return 7/8.
    limit least(90, greatest(v_round_count + 12, v_round_count * 3))
  ),
  packed as (
    select row_number() over(order by case when v_themes is null then country_rank else 0 end,recent_penalty,rnd)::integer as position,
      c.id,c.title,c.artist,c.normalized_artist,c.display_artist_key,c.artwork_url,c.preview_url,c.release_year,c.genres,c.country_code,
      coalesce(c.theme_code,'MIX') as theme_code from candidates c
  ),
  -- Pas de leurres venant d'un autre pays lorsque l'origine de l'artiste est connue.
  -- Pays inconnu : comparaisons uniquement entre autres artistes de pays inconnus;
  -- ne pas inventer une nationalité à partir de la langue ou de l'ISRC.
  distractors as (select artist,normalized_artist,display_artist_key,release_year,genres,theme_code,country_code from artist_dedup),
  with_choices as (select p.*, coalesce((select jsonb_agg(value order by random()) from (select p.artist::text as value union all
          select d.artist from (select d.artist from distractors d
            where d.normalized_artist<>p.normalized_artist
              and d.display_artist_key<>p.display_artist_key
              and d.country_code is not distinct from p.country_code
              and (p.theme_code='MIX' or d.theme_code=p.theme_code)
            order by case when d.theme_code=p.theme_code then 0 else 1 end,
              case when d.genres && p.genres then 0 else 1 end,
              case when p.release_year is not null and d.release_year is not null and abs(p.release_year::integer-d.release_year::integer)<=6 then 0 else 1 end,
              case when p.release_year is not null and d.release_year is not null then abs(p.release_year::integer-d.release_year::integer) else 99 end,
              case when lower(trim(d.artist))=any(v_recent_artists) then 1 else 0 end,
              random() limit 3) d) options),'[]'::jsonb) as choices from packed p),
  -- A pack must contain exactly the requested number of VALID questions.
  -- Filter first; take the first N; renumber 1..N with no gaps.
  valid_choices as (
    select x.* from with_choices x
    where jsonb_array_length(x.choices)=4
        and (select count(distinct regexp_replace(translate(lower(trim(choice.value)),'àáâäãåçèéêëìíîïñòóôöõùúûüýÿ','aaaaaaceeeeiiiinooooouuuuyy'),'[^[:alnum:]]','','g')) from jsonb_array_elements_text(x.choices) choice)=4
        and (select count(*) from jsonb_array_elements_text(x.choices) choice where regexp_replace(translate(lower(trim(choice.value)),'àáâäãåçèéêëìíîïñòóôöõùúûüýÿ','aaaaaaceeeeiiiinooooouuuuyy'),'[^[:alnum:]]','','g') = x.normalized_artist)=1
        and (select count(distinct regexp_replace(translate(lower(trim(split_part(split_part(split_part(split_part(choice.value,'&',1),',',1),'/',1),'+',1))),'àáâäãåçèéêëìíîïñòóôöõùúûüýÿ','aaaaaaceeeeiiiinooooouuuuyy'),'[^[:alnum:]]','','g')) from jsonb_array_elements_text(x.choices) choice)=4
  ),
  selected as (
    select * from valid_choices order by position limit v_round_count
  ),
  numbered as (
    select row_number() over(order by position)::integer as final_position, selected.* from selected
  )
  select jsonb_agg(jsonb_build_object('position',x.final_position,'trackId',x.id,'title',x.title,'artist',x.artist,'artworkUrl',x.artwork_url,
      'previewUrl',x.preview_url,'releaseYear',x.release_year,'themeCode',x.theme_code,'choices',x.choices,'correctAnswer',x.artist) order by x.position)
  into v_rounds from numbered x
;
  if jsonb_array_length(coalesce(v_rounds,'[]'::jsonb)) <> v_round_count then
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


