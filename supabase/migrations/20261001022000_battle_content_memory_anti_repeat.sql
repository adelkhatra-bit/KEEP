-- KEEP / Loki Music — Battle/Solo anti-repeat memory
-- The phone never stores a giant artist list. One bounded row per profile keeps
-- only recent content, while the central catalogue can grow independently.

create table if not exists public.keep_battle_content_memory (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  recent_track_ids uuid[] not null default array[]::uuid[],
  recent_artist_keys text[] not null default array[]::text[],
  updated_at timestamptz not null default now()
);

alter table public.keep_battle_content_memory enable row level security;
drop policy if exists keep_battle_content_memory_deny_client on public.keep_battle_content_memory;
create policy keep_battle_content_memory_deny_client
on public.keep_battle_content_memory
for all to anon, authenticated
using (false)
with check (false);

create or replace function public.keep_battle_remember_content(
  p_profile_ids uuid[],
  p_track_ids uuid[],
  p_artist_names text[]
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_profile_id uuid;
  v_tracks uuid[];
  v_artists text[];
begin
  select coalesce(array_agg(v order by ord), array[]::uuid[])
  into v_tracks
  from (
    select v, min(ord) as ord
    from unnest(coalesce(p_track_ids, array[]::uuid[])) with ordinality u(v, ord)
    where v is not null
    group by v
    order by min(ord)
    limit 120
  ) q;

  select coalesce(array_agg(v order by ord), array[]::text[])
  into v_artists
  from (
    select lower(trim(v)) as v, min(ord) as ord
    from unnest(coalesce(p_artist_names, array[]::text[])) with ordinality u(v, ord)
    where trim(coalesce(v, '')) <> ''
    group by lower(trim(v))
    order by min(ord)
    limit 240
  ) q;

  foreach v_profile_id in array coalesce(p_profile_ids, array[]::uuid[]) loop
    if v_profile_id is null then continue; end if;

    insert into public.keep_battle_content_memory as m(profile_id, recent_track_ids, recent_artist_keys, updated_at)
    values (v_profile_id, v_tracks, v_artists, now())
    on conflict (profile_id) do update set
      recent_track_ids = (
        select coalesce(array_agg(v order by ord), array[]::uuid[])
        from (
          select v, min(ord) as ord
          from unnest(excluded.recent_track_ids || m.recent_track_ids) with ordinality u(v, ord)
          where v is not null
          group by v
          order by min(ord)
          limit 120
        ) q
      ),
      recent_artist_keys = (
        select coalesce(array_agg(v order by ord), array[]::text[])
        from (
          select v, min(ord) as ord
          from unnest(excluded.recent_artist_keys || m.recent_artist_keys) with ordinality u(v, ord)
          where trim(coalesce(v, '')) <> ''
          group by v
          order by min(ord)
          limit 240
        ) q
      ),
      updated_at = now();
  end loop;
end;
$function$;

revoke all on function public.keep_battle_remember_content(uuid[], uuid[], text[]) from public;
revoke all on function public.keep_battle_remember_content(uuid[], uuid[], text[]) from anon;
revoke all on function public.keep_battle_remember_content(uuid[], uuid[], text[]) from authenticated;

create or replace function public.keep_battle_solo_pack_three_choices(
  p_theme_code text default 'MIX',
  p_round_count integer default 8,
  p_theme_codes text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_round_count integer := greatest(5, least(coalesce(p_round_count, 8), 30));
  v_rounds jsonb;
  v_label text := upper(trim(coalesce(p_theme_code, 'MIX')));
  v_themes text[];
  v_recent_tracks uuid[] := array[]::uuid[];
  v_recent_artists text[] := array[]::text[];
begin
  if v_label = '' then v_label := 'MIX'; end if;

  select nullif(array_agg(distinct u.code), array[]::text[]) into v_themes
  from (select upper(trim(x)) as code from unnest(coalesce(p_theme_codes, array[]::text[])) x) u(code)
  where u.code <> '' and u.code <> 'MIX';

  if v_themes is null and v_label <> 'MIX' then v_themes := array[v_label]; end if;
  if v_themes is not null and array_length(v_themes, 1) > 1 then v_label := 'MIX'; end if;

  if v_themes is not null and exists (
    select 1 from unnest(v_themes) c
    where not exists (select 1 from public.keep_battle_themes t where t.code = c and t.enabled = true)
  ) then
    raise exception 'BATTLE_THEME_UNAVAILABLE';
  end if;

  if v_uid is not null then
    select coalesce(recent_track_ids,array[]::uuid[]), coalesce(recent_artist_keys,array[]::text[])
    into v_recent_tracks, v_recent_artists
    from public.keep_battle_content_memory where profile_id=v_uid;
  end if;

  with ranked as (
    select t.id, t.title, t.artist, t.artwork_url, t.preview_url,
           case when t.id = any(v_recent_tracks) then 1 else 0 end as recent_penalty,
           random() as rnd
    from public.tracks t
    where t.preview_url is not null and t.preview_url <> ''
      and trim(coalesce(t.title, '')) <> ''
      and trim(coalesce(t.artist, '')) <> ''
      and (
        v_themes is null
        or exists (
          select 1 from public.keep_battle_track_themes m
          where m.track_id = t.id and m.theme_code = any(v_themes)
        )
      )
      and (
        v_uid is null
        or not exists (
          select 1 from public.playlists pl
          join public.playlist_tracks pt on pt.playlist_id=pl.id
          where pl.owner_id=v_uid and pt.track_id=t.id
        )
      )
  ), deduped as (
    select distinct on (lower(trim(artist)))
      id,title,artist,artwork_url,preview_url,recent_penalty,rnd
    from ranked
    order by lower(trim(artist)), recent_penalty, rnd
  ), candidates as (
    select id,title,artist,artwork_url,preview_url
    from deduped
    order by recent_penalty, rnd
    limit v_round_count
  ), packed as (
    select
      row_number() over ()::integer as position,
      c.id, c.title, c.artist, c.artwork_url, c.preview_url,
      (
        select m.theme_code from public.keep_battle_track_themes m
        where m.track_id = c.id and (v_themes is null or m.theme_code = any(v_themes))
        order by random() limit 1
      ) as theme_code,
      coalesce((
        select jsonb_agg(v order by random())
        from (
          select c.artist::text as v
          union
          select ranked_artist.artist
          from (
            select artist, min(theme_prio) as theme_prio, min(recent_prio) as recent_prio
            from (
              select trim(t2.artist) as artist, 0 as theme_prio,
                     case when lower(trim(t2.artist)) = any(v_recent_artists) then 1 else 0 end as recent_prio
              from public.tracks t2
              where trim(coalesce(t2.artist, '')) <> ''
                and lower(trim(t2.artist)) <> lower(trim(c.artist))
                and v_themes is not null
                and exists (select 1 from public.keep_battle_track_themes m2 where m2.track_id=t2.id and m2.theme_code = any(v_themes))
              union all
              select trim(t2.artist) as artist, 1 as theme_prio,
                     case when lower(trim(t2.artist)) = any(v_recent_artists) then 1 else 0 end as recent_prio
              from public.tracks t2
              where trim(coalesce(t2.artist, '')) <> ''
                and lower(trim(t2.artist)) <> lower(trim(c.artist))
                and exists (select 1 from public.keep_battle_track_themes m2b where m2b.track_id=t2.id)
            ) pools
            group by artist
            order by min(theme_prio), min(recent_prio), random()
            limit 3
          ) ranked_artist
        ) choices
      ), '[]'::jsonb) as choices
    from candidates c
  )
  select jsonb_agg(
    jsonb_build_object(
      'position', p.position,
      'trackId', p.id,
      'title', p.title,
      'artist', p.artist,
      'artworkUrl', p.artwork_url,
      'previewUrl', p.preview_url,
      'themeCode', p.theme_code,
      'choices', p.choices,
      'correctAnswer', p.artist
    ) order by p.position
  ) into v_rounds
  from packed p;

  if jsonb_array_length(coalesce(v_rounds, '[]'::jsonb)) < 5 then
    raise exception 'BATTLE_THEME_CATALOG_TOO_SMALL:%', coalesce(array_to_string(v_themes, '+'), v_label);
  end if;

  if v_uid is not null then
    perform public.keep_battle_remember_content(
      array[v_uid],
      array(select (r->>'trackId')::uuid from jsonb_array_elements(v_rounds) r),
      array(
        select value
        from jsonb_array_elements(v_rounds) r
        cross join lateral jsonb_array_elements_text(r->'choices') c(value)
      )
    );
  end if;

  return jsonb_build_object(
    'mode', 'SOLO_TRAINING',
    'themeCode', v_label,
    'roundCount', jsonb_array_length(v_rounds),
    'stakeFree', 0,
    'rewardFree', 0,
    'rounds', v_rounds
  );
end;
$function$;

revoke all on function public.keep_battle_solo_pack_three_choices(text, integer, text[]) from public;
grant execute on function public.keep_battle_solo_pack_three_choices(text, integer, text[]) to anon, authenticated;

create or replace function public.keep_battle_solo_pack(
  p_theme_code text default 'MIX',
  p_round_count integer default 8,
  p_theme_codes text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  payload jsonb;
  rounds jsonb;
  round_row jsonb;
  decoys jsonb;
  choices jsonb;
  track_uuid uuid;
  idx integer;
  v_themes text[];
  v_recent_artists text[] := array[]::text[];
begin
  select array_agg(code order by first_ord) into v_themes
  from (
    select upper(trim(code)) as code, min(ord) as first_ord
    from unnest(coalesce(p_theme_codes, array[]::text[])) with ordinality u(code, ord)
    where upper(trim(coalesce(code, ''))) not in ('', 'MIX')
    group by upper(trim(code))
    order by min(ord)
    limit 3
  ) selected;

  payload := public.keep_battle_solo_pack_three_choices(
    p_theme_code,
    p_round_count,
    v_themes
  );
  rounds := coalesce(payload -> 'rounds', '[]'::jsonb);

  if jsonb_array_length(rounds) = 0 then return payload; end if;

  if v_uid is not null then
    select coalesce(recent_artist_keys,array[]::text[])
    into v_recent_artists
    from public.keep_battle_content_memory where profile_id=v_uid;
  end if;

  for idx in 0..jsonb_array_length(rounds) - 1 loop
    round_row := rounds -> idx;
    track_uuid := nullif(round_row ->> 'trackId', '')::uuid;

    select coalesce(jsonb_agg(x.artist), '[]'::jsonb) into decoys
    from (
      select artist
      from (
        select distinct on (lower(trim(t.artist)))
          trim(t.artist) as artist,
          case when lower(trim(t.artist)) = any(v_recent_artists) then 1 else 0 end as recent_penalty,
          random() as rnd
        from public.tracks t
        where t.id <> track_uuid
          and trim(coalesce(t.artist, '')) <> ''
          and lower(trim(t.artist)) <> lower(trim(round_row ->> 'correctAnswer'))
          and (
            exists (
              select 1
              from public.keep_battle_track_themes target_theme
              join public.keep_battle_track_themes candidate_theme
                on candidate_theme.theme_code = target_theme.theme_code
              where target_theme.track_id = track_uuid
                and candidate_theme.track_id = t.id
                and (v_themes is null or target_theme.theme_code = any(v_themes))
            ) or (
              v_themes is null
              and not exists (select 1 from public.keep_battle_track_themes target_any where target_any.track_id = track_uuid)
              and exists (select 1 from public.keep_battle_track_themes candidate_any where candidate_any.track_id = t.id)
            )
          )
        order by lower(trim(t.artist)), recent_penalty, rnd
      ) unique_artists
      order by recent_penalty, rnd
      limit 3
    ) x;

    if jsonb_array_length(decoys) <> 3 then
      raise exception 'BATTLE_THEME_CHOICES_TOO_SMALL:%', coalesce(round_row ->> 'title', track_uuid::text);
    end if;

    select jsonb_agg(value order by random()) into choices
    from (
      select round_row ->> 'correctAnswer' as value
      union all
      select value from jsonb_array_elements_text(decoys)
    ) four;

    rounds := jsonb_set(rounds, array[idx::text, 'choices'], choices, false);
  end loop;

  if v_uid is not null then
    perform public.keep_battle_remember_content(
      array[v_uid],
      array(select (r->>'trackId')::uuid from jsonb_array_elements(rounds) r),
      array(
        select value
        from jsonb_array_elements(rounds) r
        cross join lateral jsonb_array_elements_text(r->'choices') c(value)
      )
    );
  end if;

  return jsonb_set(payload, '{rounds}', rounds, false);
end;
$function$;

revoke all on function public.keep_battle_solo_pack(text, integer, text[]) from public;
grant execute on function public.keep_battle_solo_pack(text, integer, text[]) to anon, authenticated;

create or replace function public.keep_battle_arena_seed_rounds(p_arena_id uuid, p_match_no integer)
returns void
language plpgsql
security definer
set search_path to 'public'
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
  multi := a.theme_codes is not null and array_length(a.theme_codes,1) > 0;

  select coalesce(array_agg(am.profile_id), array[]::uuid[])
  into v_member_ids
  from public.keep_battle_arena_members am
  where am.arena_id=a.id and am.seat_status='ACTIVE';

  select coalesce(array_agg(distinct tid), array[]::uuid[])
  into v_recent_tracks
  from public.keep_battle_content_memory m
  cross join lateral unnest(m.recent_track_ids) tid
  where m.profile_id = any(v_member_ids);

  select coalesce(array_agg(distinct artist_key), array[]::text[])
  into v_recent_artists
  from public.keep_battle_content_memory m
  cross join lateral unnest(m.recent_artist_keys) artist_key
  where m.profile_id = any(v_member_ids);

  with ranked as(
    select t.id,t.title,t.artist,t.artwork_url,t.preview_url,t.release_year,
           case when t.id=any(v_recent_tracks) then 1 else 0 end as recent_penalty,
           md5(t.id::text||a.id::text||p_match_no::text||a.theme_code) as rnd
    from public.tracks t
    where t.preview_url is not null and t.preview_url<>''
      and trim(coalesce(t.title,''))<>''
      and trim(coalesce(t.artist,''))<>''
      and (
        (multi and exists(select 1 from public.keep_battle_track_themes m where m.track_id=t.id and m.theme_code=any(a.theme_codes)))
        or (not multi and (
          a.theme_code='MIX'
          or exists(select 1 from public.keep_battle_track_themes m where m.track_id=t.id and m.theme_code=a.theme_code)
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
  deduped as (
    select distinct on (lower(trim(artist))) id,title,artist,artwork_url,preview_url,release_year,recent_penalty,rnd
    from ranked
    order by lower(trim(artist)), recent_penalty, rnd
  ),
  candidates as (
    select id,title,artist,artwork_url,preview_url,release_year
    from deduped
    order by recent_penalty, rnd
    limit a.round_count
  )
  insert into public.keep_battle_arena_rounds(arena_id,match_no,position,track_id,title_snapshot,artist_snapshot,artwork_url,preview_url,release_year_snapshot,theme_code)
  select a.id,p_match_no,row_number()over()::smallint,id,title,artist,artwork_url,preview_url,release_year,
    (
      select m.theme_code from public.keep_battle_track_themes m
      where m.track_id = candidates.id
        and (not multi or m.theme_code = any(a.theme_codes))
        and (multi or a.theme_code = 'MIX' or m.theme_code = a.theme_code)
      order by random() limit 1
    )
  from candidates;
  get diagnostics inserted=row_count;
  if inserted<5 then raise exception 'BATTLE_CATALOG_TOO_SMALL'; end if;

  for rr in
    select id,position,artist_snapshot
    from public.keep_battle_arena_rounds
    where arena_id=a.id and match_no=p_match_no
    order by position
  loop
    select artist into d1 from (
      select artist, min(theme_prio) as theme_prio, min(recent_prio) as recent_prio
      from (
        select trim(artist) as artist, 0 as theme_prio,
               case when lower(trim(artist))=any(v_recent_artists) then 1 else 0 end as recent_prio
        from public.tracks t3
        where trim(coalesce(artist,''))<>'' and lower(trim(artist))<>lower(trim(rr.artist_snapshot))
          and (
            (multi and exists(select 1 from public.keep_battle_track_themes m3 where m3.track_id=t3.id and m3.theme_code=any(a.theme_codes)))
            or (not multi and a.theme_code<>'MIX' and exists(select 1 from public.keep_battle_track_themes m3 where m3.track_id=t3.id and m3.theme_code=a.theme_code))
          )
        union all
        select trim(artist) as artist, 1 as theme_prio,
               case when lower(trim(artist))=any(v_recent_artists) then 1 else 0 end as recent_prio
        from public.tracks
        where trim(coalesce(artist,''))<>'' and lower(trim(artist))<>lower(trim(rr.artist_snapshot))
      ) pools
      group by artist
      order by min(theme_prio), min(recent_prio), random()
      limit 1
    ) x;

    select artist into d2 from (
      select artist, min(theme_prio) as theme_prio, min(recent_prio) as recent_prio
      from (
        select trim(artist) as artist, 0 as theme_prio,
               case when lower(trim(artist))=any(v_recent_artists) then 1 else 0 end as recent_prio
        from public.tracks t4
        where trim(coalesce(artist,''))<>''
          and lower(trim(artist))<>lower(trim(rr.artist_snapshot))
          and trim(artist)<>coalesce(d1,'')
          and (
            (multi and exists(select 1 from public.keep_battle_track_themes m4 where m4.track_id=t4.id and m4.theme_code=any(a.theme_codes)))
            or (not multi and a.theme_code<>'MIX' and exists(select 1 from public.keep_battle_track_themes m4 where m4.track_id=t4.id and m4.theme_code=a.theme_code))
          )
        union all
        select trim(artist) as artist, 1 as theme_prio,
               case when lower(trim(artist))=any(v_recent_artists) then 1 else 0 end as recent_prio
        from public.tracks
        where trim(coalesce(artist,''))<>''
          and lower(trim(artist))<>lower(trim(rr.artist_snapshot))
          and trim(artist)<>coalesce(d1,'')
      ) pools
      group by artist
      order by min(theme_prio), min(recent_prio), random()
      limit 1
    ) x;

    slot := floor(random()*3)::integer + 1;
    if slot = prev_slot then
      if random() < 0.5 then slot := (prev_slot % 3) + 1;
      else slot := ((prev_slot + 1) % 3) + 1;
      end if;
    end if;
    prev_slot := slot;

    update public.keep_battle_arena_rounds
    set choices = case slot
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

revoke all on function public.keep_battle_arena_seed_rounds(uuid, integer) from public;
revoke all on function public.keep_battle_arena_seed_rounds(uuid, integer) from anon;
grant execute on function public.keep_battle_arena_seed_rounds(uuid, integer) to authenticated;
