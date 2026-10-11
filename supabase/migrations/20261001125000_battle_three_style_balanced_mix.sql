-- Final Battle/Solo style rule: at most 3 styles, and actually mix them.
-- The selected set is persisted in Supabase and both Solo + Arena round builders
-- rotate across the selected styles instead of drawing randomly from one big union.

create or replace function public.keep_battle_save_match_preferences(
  p_theme_codes text[],
  p_round_count integer default 8
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
  uid uuid := auth.uid();
  v_codes text[];
  v_round integer := greatest(5, least(coalesce(p_round_count, 8), 30));
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select array_agg(code order by first_ord) into v_codes
  from (
    select upper(trim(code)) as code, min(ord) as first_ord
    from unnest(coalesce(p_theme_codes, array['MIX']::text[])) with ordinality u(code, ord)
    where upper(trim(coalesce(code, ''))) not in ('', 'MIX')
    group by upper(trim(code))
    order by min(ord)
    limit 3
  ) chosen;

  if v_codes is null or cardinality(v_codes)=0 then
    v_codes := array['MIX'];
  end if;

  if exists (
    select 1
    from unnest(v_codes) code
    where code <> 'MIX'
      and not exists (
        select 1 from public.keep_battle_themes t
        where t.code=code and t.enabled=true
      )
  ) then
    raise exception 'BATTLE_THEME_UNAVAILABLE';
  end if;

  insert into public.keep_battle_match_preferences(profile_id,theme_codes,round_count,updated_at)
  values(uid,v_codes,v_round,now())
  on conflict(profile_id) do update
    set theme_codes=excluded.theme_codes,
        round_count=excluded.round_count,
        updated_at=now();

  return jsonb_build_object('themeCodes',to_jsonb(v_codes),'roundCount',v_round);
end;
$function$;

create or replace function public.keep_battle_solo_pack(
  p_theme_code text default 'MIX',
  p_round_count integer default 8,
  p_theme_codes text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
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
  raw as (
    select
      t.id,t.title,t.artist,t.artwork_url,t.preview_url,t.release_year,
      chosen.theme_code,
      chosen.theme_ord,
      case when t.id=any(v_recent_tracks) then 1 else 0 end as recent_penalty,
      random() as rnd
    from public.tracks t
    left join lateral (
      select tl.code as theme_code,tl.theme_ord
      from theme_list tl
      join public.keep_battle_track_themes m
        on m.track_id=t.id and m.theme_code=tl.code
      order by tl.theme_ord
      limit 1
    ) chosen on true
    where nullif(trim(t.preview_url),'') is not null
      and nullif(trim(t.title),'') is not null
      and nullif(trim(t.artist),'') is not null
      and (v_themes is null or chosen.theme_code is not null)
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
      select r.*,
             row_number() over(
               partition by lower(trim(r.artist))
               order by r.recent_penalty,r.rnd
             ) as artist_rn
      from raw r
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
      coalesce(c.theme_code,(
        select m.theme_code
        from public.keep_battle_track_themes m
        where m.track_id=c.id
        order by m.confidence desc,m.theme_code
        limit 1
      ),'MIX') as theme_code
    from candidates c
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
            from (
              select distinct on(lower(trim(t2.artist)))
                trim(t2.artist) as artist,
                case when lower(trim(t2.artist))=any(v_recent_artists) then 1 else 0 end as recent_prio,
                case when exists(
                  select 1 from public.keep_battle_track_themes m2
                  where m2.track_id=t2.id and m2.theme_code=p.theme_code
                ) then 0 else 1 end as theme_prio,
                random() as rnd
              from public.tracks t2
              where nullif(trim(t2.artist),'') is not null
                and lower(trim(t2.artist))<>lower(trim(p.artist))
              order by lower(trim(t2.artist)),theme_prio,recent_prio,rnd
            ) q
            order by theme_prio,recent_prio,rnd
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

create or replace function public.keep_battle_arena_seed_rounds(
  p_arena_id uuid,
  p_match_no integer
)
returns void
language plpgsql
security definer
set search_path=public
as $function$
declare
  a public.keep_battle_arenas%rowtype;
  inserted integer;
  rr record;
  d1 text;
  d2 text;
  slot integer;
  prev_slot integer := 0;
  multi boolean;
  v_recent_tracks uuid[] := array[]::uuid[];
  v_recent_artists text[] := array[]::text[];
  v_member_ids uuid[] := array[]::uuid[];
begin
  select * into a from public.keep_battle_arenas where id=p_arena_id;
  if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;

  delete from public.keep_battle_arena_rounds where arena_id=a.id and match_no=p_match_no;
  multi := a.theme_codes is not null and cardinality(a.theme_codes)>0;

  if multi and cardinality(a.theme_codes)>3 then
    a.theme_codes:=a.theme_codes[1:3];
  end if;

  select coalesce(array_agg(am.profile_id),array[]::uuid[])
    into v_member_ids
  from public.keep_battle_arena_members am
  where am.arena_id=a.id and am.seat_status='ACTIVE';

  select coalesce(array_agg(distinct tid),array[]::uuid[])
    into v_recent_tracks
  from public.keep_battle_content_memory m
  cross join lateral unnest(m.recent_track_ids) tid
  where m.profile_id=any(v_member_ids);

  select coalesce(array_agg(distinct artist_key),array[]::text[])
    into v_recent_artists
  from public.keep_battle_content_memory m
  cross join lateral unnest(m.recent_artist_keys) artist_key
  where m.profile_id=any(v_member_ids);

  with theme_list as (
    select upper(trim(code)) as code,ord::integer as theme_ord
    from unnest(coalesce(a.theme_codes,array[]::text[])) with ordinality u(code,ord)
  ),
  raw as (
    select
      t.id,t.title,t.artist,t.artwork_url,t.preview_url,t.release_year,
      chosen.theme_code,
      chosen.theme_ord,
      case when t.id=any(v_recent_tracks) then 1 else 0 end as recent_penalty,
      md5(t.id::text||a.id::text||p_match_no::text||coalesce(chosen.theme_code,a.theme_code)) as rnd
    from public.tracks t
    left join lateral (
      select tl.code as theme_code,tl.theme_ord
      from theme_list tl
      join public.keep_battle_track_themes m on m.track_id=t.id and m.theme_code=tl.code
      order by tl.theme_ord
      limit 1
    ) chosen on true
    where nullif(trim(t.preview_url),'') is not null
      and nullif(trim(t.title),'') is not null
      and nullif(trim(t.artist),'') is not null
      and (
        (multi and chosen.theme_code is not null)
        or (not multi and (
          a.theme_code='MIX'
          or exists(
            select 1 from public.keep_battle_track_themes m
            where m.track_id=t.id and m.theme_code=a.theme_code
          )
        ))
      )
      and not exists (
        select 1
        from public.keep_battle_arena_members am
        join public.playlists p on p.owner_id=am.profile_id
        join public.playlist_tracks pt on pt.playlist_id=p.id
        where am.arena_id=a.id and am.seat_status='ACTIVE' and pt.track_id=t.id
      )
  ),
  artist_dedup as (
    select *
    from (
      select r.*,
             row_number() over(
               partition by lower(trim(r.artist))
               order by r.recent_penalty,r.rnd
             ) as artist_rn
      from raw r
    ) x
    where x.artist_rn=1
  ),
  ranked as (
    select d.*,
           case when multi then
             row_number() over(partition by d.theme_code order by d.recent_penalty,d.rnd)
           else 1 end as theme_rank
    from artist_dedup d
  ),
  candidates as (
    select *
    from ranked
    order by
      case when multi then theme_rank else recent_penalty end,
      case when multi then theme_ord else 1 end,
      recent_penalty,
      rnd
    limit a.round_count
  )
  insert into public.keep_battle_arena_rounds(
    arena_id,match_no,position,track_id,title_snapshot,artist_snapshot,
    artwork_url,preview_url,release_year_snapshot,theme_code
  )
  select
    a.id,p_match_no,
    row_number() over(
      order by
        case when multi then theme_rank else recent_penalty end,
        case when multi then theme_ord else 1 end,
        rnd
    )::smallint,
    id,title,artist,artwork_url,preview_url,release_year,
    case
      when multi then theme_code
      when a.theme_code<>'MIX' then a.theme_code
      else (
        select m.theme_code
        from public.keep_battle_track_themes m
        where m.track_id=candidates.id
        order by m.confidence desc,m.theme_code
        limit 1
      )
    end
  from candidates;

  get diagnostics inserted=row_count;
  if inserted<5 then raise exception 'BATTLE_CATALOG_TOO_SMALL'; end if;

  for rr in
    select id,position,artist_snapshot,theme_code
    from public.keep_battle_arena_rounds
    where arena_id=a.id and match_no=p_match_no
    order by position
  loop
    select artist into d1 from (
      select artist,min(theme_prio) as theme_prio,min(recent_prio) as recent_prio
      from (
        select trim(t3.artist) as artist,0 as theme_prio,
               case when lower(trim(t3.artist))=any(v_recent_artists) then 1 else 0 end as recent_prio
        from public.tracks t3
        where nullif(trim(t3.artist),'') is not null
          and lower(trim(t3.artist))<>lower(trim(rr.artist_snapshot))
          and exists(
            select 1 from public.keep_battle_track_themes m3
            where m3.track_id=t3.id and m3.theme_code=coalesce(rr.theme_code,a.theme_code)
          )
        union all
        select trim(artist),1,
               case when lower(trim(artist))=any(v_recent_artists) then 1 else 0 end
        from public.tracks
        where nullif(trim(artist),'') is not null
          and lower(trim(artist))<>lower(trim(rr.artist_snapshot))
      ) pools
      group by artist
      order by min(theme_prio),min(recent_prio),random()
      limit 1
    ) x;

    select artist into d2 from (
      select artist,min(theme_prio) as theme_prio,min(recent_prio) as recent_prio
      from (
        select trim(t4.artist) as artist,0 as theme_prio,
               case when lower(trim(t4.artist))=any(v_recent_artists) then 1 else 0 end as recent_prio
        from public.tracks t4
        where nullif(trim(t4.artist),'') is not null
          and lower(trim(t4.artist))<>lower(trim(rr.artist_snapshot))
          and trim(t4.artist)<>coalesce(d1,'')
          and exists(
            select 1 from public.keep_battle_track_themes m4
            where m4.track_id=t4.id and m4.theme_code=coalesce(rr.theme_code,a.theme_code)
          )
        union all
        select trim(artist),1,
               case when lower(trim(artist))=any(v_recent_artists) then 1 else 0 end
        from public.tracks
        where nullif(trim(artist),'') is not null
          and lower(trim(artist))<>lower(trim(rr.artist_snapshot))
          and trim(artist)<>coalesce(d1,'')
      ) pools
      group by artist
      order by min(theme_prio),min(recent_prio),random()
      limit 1
    ) x;

    slot:=floor(random()*3)::integer+1;
    if slot=prev_slot then
      if random()<0.5 then slot:=(prev_slot%3)+1;
      else slot:=((prev_slot+1)%3)+1;
      end if;
    end if;
    prev_slot:=slot;

    update public.keep_battle_arena_rounds
    set choices=case slot
      when 1 then jsonb_build_array(rr.artist_snapshot,d1,d2)
      when 2 then jsonb_build_array(d1,rr.artist_snapshot,d2)
      else jsonb_build_array(d1,d2,rr.artist_snapshot)
    end
    where id=rr.id;
  end loop;

  perform public.keep_battle_remember_content(
    v_member_ids,
    array(
      select r.track_id
      from public.keep_battle_arena_rounds r
      where r.arena_id=a.id and r.match_no=p_match_no
      order by r.position
    ),
    array(
      select distinct value
      from public.keep_battle_arena_rounds r
      cross join lateral jsonb_array_elements_text(r.choices) c(value)
      where r.arena_id=a.id and r.match_no=p_match_no
    )
  );
end;
$function$;
