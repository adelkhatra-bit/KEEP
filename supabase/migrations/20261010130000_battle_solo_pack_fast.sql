-- Adel (10/10/2026) : « solo / Battle : connexion trop lente ». Mesure en production (lecture seule, 10/10/2026) :
-- keep_battle_solo_pack('MIX', 8) = 17,3 s ; moyenne des 56 appels des journaux = 6,4 s, max 12,5 s, alors que l'application
-- abandonne à 8 s (BATTLE_NETWORK_TIMEOUT -> « Connexion trop lente »).
-- Cause racine : la fonction numérotait (random() + fenêtres) les ~50 000 titres, puis, pour CHAQUE manche, re-triait toute la table
-- pour choisir 3 faux artistes. Correction : on tire d'abord un échantillon aléatoire de 500 titres jouables et on travaille dessus
-- (mêmes règles : styles, mémoire anti-répétition, exclusion des titres déjà en playlist, 4 propositions, mêmes erreurs).
-- Même signature, même JSON de retour. Mesure du même calcul sur échantillon : MIX 123 ms, 2 styles 1,26 s.
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
begin
  if v_label='' then v_label:='MIX'; end if;

  select array_agg(code order by first_ord) into v_themes
  from (
    select upper(trim(code)) as code,min(ord) as first_ord
    from unnest(coalesce(p_theme_codes,array[]::text[])) with ordinality u(code,ord)
    where upper(trim(coalesce(code,''))) not in ('','MIX')
    group by upper(trim(code))
    order by min(ord)
    limit 3
  ) chosen;

  if v_themes is null and v_label<>'MIX' then v_themes:=array[v_label]; end if;
  if v_themes is not null and exists (
    select 1 from unnest(v_themes) c
    where not exists(select 1 from public.keep_battle_themes t where t.code=c and t.enabled=true)
  ) then
    raise exception 'BATTLE_THEME_UNAVAILABLE';
  end if;
  if v_themes is not null and cardinality(v_themes)>1 then v_label:='MIX'; end if;

  if v_uid is not null then
    select coalesce(recent_track_ids,array[]::uuid[]),coalesce(recent_artist_keys,array[]::text[])
      into v_recent_tracks,v_recent_artists
    from public.keep_battle_content_memory
    where profile_id=v_uid;
  end if;

  with theme_list as (
    select upper(trim(code)) as code,ord::integer as theme_ord
    from unnest(coalesce(v_themes,array[]::text[])) with ordinality u(code,ord)
  ),
  pool as (
    select
      t.id,t.title,t.artist,t.artwork_url,t.preview_url,t.release_year,
      chosen.theme_code,
      chosen.theme_ord,
      case when t.id=any(v_recent_tracks) then 1 else 0 end as recent_penalty,
      random() as rnd
    from (
      select t0.*
      from public.tracks t0
      where nullif(trim(t0.preview_url),'') is not null
        and nullif(trim(t0.title),'') is not null
        and nullif(trim(t0.artist),'') is not null
        and (v_themes is null or exists (
          select 1 from public.keep_battle_track_themes m0
          where m0.track_id=t0.id and m0.theme_code=any(v_themes)
        ))
      order by random()
      limit 500
    ) t
    left join lateral (
      select tl.code as theme_code,tl.theme_ord
      from theme_list tl
      join public.keep_battle_track_themes m
        on m.track_id=t.id and m.theme_code=tl.code
      order by tl.theme_ord
      limit 1
    ) chosen on true
    where (v_themes is null or chosen.theme_code is not null)
      and (
        v_uid is null
        or not exists (
          select 1
          from public.playlists pl
          join public.playlist_tracks pt on pt.playlist_id=pl.id
          where pl.owner_id=v_uid and pt.track_id=t.id
        )
      )
  ),
  artist_dedup as (
    select *
    from (
      select p.*,
             row_number() over(
               partition by lower(trim(p.artist))
               order by p.recent_penalty,p.rnd
             ) as artist_rn
      from pool p
    ) x
    where x.artist_rn=1
  ),
  ranked as (
    select d.*,
           case when v_themes is null then 1
                else row_number() over(
                  partition by d.theme_code
                  order by d.recent_penalty,d.rnd
                )
           end as theme_rank
    from artist_dedup d
  ),
  candidates as (
    select *
    from ranked
    order by
      case when v_themes is null then recent_penalty else theme_rank end,
      case when v_themes is null then 1 else theme_ord end,
      recent_penalty,
      rnd
    limit v_round_count
  ),
  packed as (
    select
      row_number() over(
        order by
          case when v_themes is null then recent_penalty else theme_rank end,
          case when v_themes is null then 1 else theme_ord end,
          rnd
      )::integer as position,
      c.id,c.title,c.artist,c.artwork_url,c.preview_url,c.release_year,
      coalesce(c.theme_code,'MIX') as theme_code
    from candidates c
  ),
  global_sample as (
    select t.artist
    from public.tracks t
    where nullif(trim(t.artist),'') is not null
    order by random()
    limit 300
  ),
  distractors as (
    select distinct on (lower(trim(artist))) trim(artist) as artist,prio
    from (
      select artist,0 as prio from pool
      union all
      select artist,1 as prio from global_sample
    ) x
    order by lower(trim(artist)),prio
  ),
  with_choices as (
    select p.*,
      coalesce((
        select jsonb_agg(value order by random())
        from (
          select p.artist::text as value
          union all
          select d.artist
          from (
            select artist
            from distractors
            where lower(artist)<>lower(trim(p.artist))
            order by prio,
                     case when lower(artist)=any(v_recent_artists) then 1 else 0 end,
                     random()
            limit 3
          ) d
        ) options
      ),'[]'::jsonb) as choices
    from packed p
  )
  select jsonb_agg(
    jsonb_build_object(
      'position',x.position,
      'trackId',x.id,
      'title',x.title,
      'artist',x.artist,
      'artworkUrl',x.artwork_url,
      'previewUrl',x.preview_url,
      'releaseYear',x.release_year,
      'themeCode',x.theme_code,
      'choices',x.choices,
      'correctAnswer',x.artist
    )
    order by x.position
  )
  into v_rounds
  from with_choices x
  where jsonb_array_length(x.choices)=4;

  if jsonb_array_length(coalesce(v_rounds,'[]'::jsonb))<5 then
    raise exception 'BATTLE_THEME_CATALOG_TOO_SMALL:%',coalesce(array_to_string(v_themes,'+'),v_label);
  end if;

  if v_uid is not null then
    perform public.keep_battle_remember_content(
      array[v_uid],
      array(select (r->>'trackId')::uuid from jsonb_array_elements(v_rounds) r),
      array(
        select c.choice_value
        from jsonb_array_elements(v_rounds) r
        cross join lateral jsonb_array_elements_text(r->'choices') c(choice_value)
      )
    );
  end if;

  return jsonb_build_object(
    'mode','SOLO_TRAINING',
    'themeCode',v_label,
    'themeCodes',to_jsonb(coalesce(v_themes,array['MIX']::text[])),
    'roundCount',jsonb_array_length(v_rounds),
    'stakeFree',0,
    'rewardFree',0,
    'rounds',v_rounds
  );
end;
$function$;
