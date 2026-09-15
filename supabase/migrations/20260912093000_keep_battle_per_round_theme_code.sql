-- Adel (12/09/2026) : "j'ai sélectionné trois styles musicales ... il est
-- resté coincé sur Funk. Pourquoi il ne change pas automatiquement ...
-- la musique arrive, il y a le style au-dessus" -- BUG RÉEL confirmé en
-- lisant le SQL : le tirage multi-styles (solo ET arène, ajouté le
-- 04/09/2026) pioche déjà correctement dans l'UNION des styles cochés,
-- mais AUCUNE manche ne mémorisait JAMAIS à quel style le morceau tiré
-- appartenait. Le client n'avait donc d'autre choix que d'afficher un seul
-- libellé figé pour toute la partie (le premier style envoyé), jamais mis
-- à jour manche après manche.
--
-- Corrige les deux systèmes de la même façon (même règle partout, comme le
-- reste de Battle) : chaque manche mémorise désormais le style réel du
-- morceau tiré parmi les styles sélectionnés.

-- 1) Arène (multijoueur) : nouvelle colonne pour stocker le style de la
-- manche au moment du tirage (keep_battle_arena_seed_rounds), exposée
-- ensuite dans keep_battle_arena_state.
alter table public.keep_battle_arena_rounds
  add column if not exists theme_code text;

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
begin
  select * into a from public.keep_battle_arenas where id=p_arena_id; if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
  delete from public.keep_battle_arena_rounds where arena_id=a.id and match_no=p_match_no;
  multi := a.theme_codes is not null and array_length(a.theme_codes,1) > 0;

  with ranked as(
    select t.id,t.title,t.artist,t.artwork_url,t.preview_url,t.release_year,
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
    select distinct on (lower(trim(artist))) id,title,artist,artwork_url,preview_url,release_year,rnd
    from ranked
    order by lower(trim(artist)), rnd
  ),
  candidates as (
    select id,title,artist,artwork_url,preview_url,release_year
    from deduped
    order by rnd
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
      select artist, min(prio) as prio from (
        select trim(artist) as artist, 0 as prio
        from public.tracks t3
        where trim(coalesce(artist,''))<>'' and lower(trim(artist))<>lower(trim(rr.artist_snapshot))
          and (
            (multi and exists(select 1 from public.keep_battle_track_themes m3 where m3.track_id=t3.id and m3.theme_code=any(a.theme_codes)))
            or (not multi and a.theme_code<>'MIX' and exists(select 1 from public.keep_battle_track_themes m3 where m3.track_id=t3.id and m3.theme_code=a.theme_code))
          )
        union all
        select trim(artist) as artist, 1 as prio
        from public.tracks
        where trim(coalesce(artist,''))<>'' and lower(trim(artist))<>lower(trim(rr.artist_snapshot))
      ) both_pools
      group by artist
      order by min(prio), random()
      limit 1
    ) x;

    select artist into d2 from (
      select artist, min(prio) as prio from (
        select trim(artist) as artist, 0 as prio
        from public.tracks t4
        where trim(coalesce(artist,''))<>''
          and lower(trim(artist))<>lower(trim(rr.artist_snapshot))
          and trim(artist)<>coalesce(d1,'')
          and (
            (multi and exists(select 1 from public.keep_battle_track_themes m4 where m4.track_id=t4.id and m4.theme_code=any(a.theme_codes)))
            or (not multi and a.theme_code<>'MIX' and exists(select 1 from public.keep_battle_track_themes m4 where m4.track_id=t4.id and m4.theme_code=a.theme_code))
          )
        union all
        select trim(artist) as artist, 1 as prio
        from public.tracks
        where trim(coalesce(artist,''))<>''
          and lower(trim(artist))<>lower(trim(rr.artist_snapshot))
          and trim(artist)<>coalesce(d1,'')
      ) both_pools
      group by artist
      order by min(prio), random()
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
end;
$function$;

create or replace function public.keep_battle_arena_state(p_arena_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid:=auth.uid(); a public.keep_battle_arenas%rowtype; seats jsonb; board jsonb; current jsonb; me jsonb; queue_count integer; open_seats integer; pending_invite_count integer; cr public.keep_battle_arena_rounds%rowtype; round_winner jsonb; last_result jsonb; last_winner jsonb; last_match_results jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  perform public.keep_battle_arena_release_stale_seats(uid);
  select * into a from public.keep_battle_arenas where id=p_arena_id; if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
  if not exists(select 1 from public.keep_battle_arena_members where arena_id=a.id and profile_id=uid) then raise exception 'BATTLE_ARENA_FORBIDDEN'; end if;
  if a.status='ACTIVE' then
    select * into cr from public.keep_battle_arena_rounds where arena_id=a.id and match_no=a.match_no and position=a.current_round;
    if found and cr.finalized_at is null and cr.closes_at<=now() then perform public.keep_battle_arena_finalize_round(a.id); end if;
    select * into cr from public.keep_battle_arena_rounds where arena_id=a.id and match_no=a.match_no and position=a.current_round;
    if found and cr.finalized_at is not null and cr.reveal_until<=now() then perform public.keep_battle_arena_advance_after_reveal(a.id); end if;
    select * into a from public.keep_battle_arenas where id=p_arena_id;
  end if;
  if a.status='WAITING' and a.rematch_deadline is not null then
    perform public.keep_battle_arena_finalize_rematch(a.id);
    select * into a from public.keep_battle_arenas where id=p_arena_id;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('profileId',x.profile_id,'username',x.username,'avatarUrl',x.avatar_url,'followers',x.followers,'favoriteGenres',x.favorite_genres,'favoriteArtists',x.favorite_artists,'score',x.score,'placement',x.placement,'isHost',x.profile_id=a.host_id) order by x.score desc,x.total_response_ms asc,x.joined_at asc),'[]'::jsonb) into seats
  from(select m.profile_id,p.username,p.avatar_url,p.favorite_genres,p.favorite_artists,m.score,m.placement,m.total_response_ms,m.joined_at,(select count(*) from public.follows f where f.followee_id=m.profile_id) followers from public.keep_battle_arena_members m join public.profiles p on p.id=m.profile_id where m.arena_id=a.id and m.seat_status='ACTIVE' order by m.score desc,m.total_response_ms asc,m.joined_at asc limit 10)x;
  select coalesce(jsonb_agg(jsonb_build_object('profileId',x.profile_id,'username',x.username,'score',x.score,'placement',x.placement,'responseMs',x.total_response_ms) order by x.score desc,x.total_response_ms asc),'[]'::jsonb) into board
  from(select m.profile_id,p.username,m.score,m.placement,m.total_response_ms from public.keep_battle_arena_members m join public.profiles p on p.id=m.profile_id where m.arena_id=a.id and m.seat_status='ACTIVE' order by m.score desc,m.total_response_ms asc limit 10)x;
  select jsonb_build_object('profileId',m.profile_id,'status',m.seat_status,'score',m.score,'placement',m.placement,'rematchReady',m.rematch_ready) into me from public.keep_battle_arena_members m where m.arena_id=a.id and m.profile_id=uid;
  select case when r.id is null then null else jsonb_build_object(
    'position',r.position,
    'title',case when r.finalized_at is not null or ans.profile_id is not null then r.title_snapshot else null end,
    'artist',case when r.finalized_at is not null or ans.profile_id is not null then r.artist_snapshot else null end,
    'releaseYear',case when r.finalized_at is not null or ans.profile_id is not null then r.release_year_snapshot else null end,
    'artworkUrl',case when r.finalized_at is not null or ans.profile_id is not null then r.artwork_url else null end,
    'previewUrl',r.preview_url,'choices',r.choices,'startedAt',r.started_at,'closesAt',r.closes_at,'revealUntil',r.reveal_until,'revealed',r.finalized_at is not null,
    'themeCode',r.theme_code,
    'answered',ans.profile_id is not null,
    'myAnswer',case when ans.profile_id is null then null else jsonb_build_object('selectedAnswer',ans.selected_answer,'responseMs',ans.response_ms,'points',case when r.finalized_at is not null then ans.points else 0 end,'correct',lower(trim(coalesce(ans.selected_answer,'')))=lower(trim(coalesce(r.artist_snapshot,'')))) end
  ) end into current
  from public.keep_battle_arena_rounds r left join public.keep_battle_arena_answers ans on ans.round_id=r.id and ans.profile_id=uid
  where r.arena_id=a.id and r.match_no=a.match_no and r.position=greatest(a.current_round,1);

  select case when z.profile_id is null then null else jsonb_build_object('profileId',z.profile_id,'username',p.username,'avatarUrl',p.avatar_url,'responseMs',z.response_ms) end into round_winner
  from public.keep_battle_arena_answers z join public.profiles p on p.id=z.profile_id join public.keep_battle_arena_rounds rr on rr.id=z.round_id
  where rr.arena_id=a.id and rr.match_no=a.match_no and rr.position=greatest(a.current_round,1) and rr.finalized_at is not null and z.is_correct=true
  order by z.response_ms asc,z.submitted_at asc limit 1;

  if a.match_no > 1 then
    select jsonb_build_object('matchNo',r.match_no,'placement',r.placement,'score',r.score,'correct',r.correct_predictions,'responseMs',r.total_response_ms,'creditDelta',coalesce(e.amount,0),'won',coalesce(e.amount,0)>0)
    into last_result
    from public.keep_battle_arena_match_results r left join public.keep_battle_arena_credit_events e on e.arena_id=r.arena_id and e.match_no=r.match_no and e.profile_id=r.profile_id
    where r.arena_id=a.id and r.match_no=a.match_no-1 and r.profile_id=uid;

    select jsonb_build_object('profileId',r.profile_id,'username',p.username,'avatarUrl',p.avatar_url,'score',r.score,'responseMs',r.total_response_ms)
    into last_winner from public.keep_battle_arena_match_results r join public.profiles p on p.id=r.profile_id
    where r.arena_id=a.id and r.match_no=a.match_no-1 and r.placement=1 limit 1;

    select coalesce(jsonb_agg(jsonb_build_object('profileId',x.profile_id,'username',x.username,'placement',x.placement,'score',x.score,'correct',x.correct_predictions,'responseMs',x.total_response_ms,'won',coalesce(x.credit_delta,0)>0) order by x.placement asc),'[]'::jsonb)
    into last_match_results
    from(select r.profile_id,p.username,r.placement,r.score,r.correct_predictions,r.total_response_ms,e.amount credit_delta from public.keep_battle_arena_match_results r join public.profiles p on p.id=r.profile_id left join public.keep_battle_arena_credit_events e on e.arena_id=r.arena_id and e.match_no=r.match_no and e.profile_id=r.profile_id where r.arena_id=a.id and r.match_no=a.match_no-1)x;
  end if;

  select count(*) into queue_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='QUEUED';
  select greatest(0,a.max_players-count(*)) into open_seats from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
  select count(*) into pending_invite_count from public.keep_battle_challenges where arena_id=a.id and status='PENDING' and expires_at>now();
  return jsonb_build_object('id',a.id,'arenaCode',a.arena_code,'themeCode',a.theme_code,'themeCodes',to_jsonb(a.theme_codes),'status',a.status,'maxPlayers',a.max_players,'openSeats',open_seats,'queue',queue_count,'pendingInviteCount',coalesce(pending_invite_count,0),'roundCount',a.round_count,'matchNo',a.match_no,'currentRound',a.current_round,'roundDurationMs',a.round_duration_ms,'isHost',a.host_id=uid,'me',me,'seats',seats,'leaderboard',board,'round',current,'roundWinner',round_winner,'lastResult',last_result,'lastWinner',last_winner,'lastMatchResults',coalesce(last_match_results,'[]'::jsonb),'rematchDeadline',a.rematch_deadline);
end;
$function$;

-- 2) Solo (JOUER SOLO / MIX confirmé) : le pack renvoyé porte déjà l'UNION
-- des styles choisis (v_themes) -- ajoute juste le style réel du morceau
-- tiré sur chaque manche, et corrige le libellé global à 'MIX' dès que 2+
-- styles sont cochés (au lieu du premier style envoyé, gardé par erreur).
create or replace function public.keep_battle_solo_pack_three_choices(p_theme_code text default 'MIX'::text, p_round_count integer default 8, p_theme_codes text[] default NULL::text[])
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
begin
  if v_label = '' then v_label := 'MIX'; end if;

  select nullif(array_agg(distinct u.code), array[]::text[]) into v_themes
  from (select upper(trim(x)) as code from unnest(coalesce(p_theme_codes, array[]::text[])) x) u(code)
  where u.code <> '' and u.code <> 'MIX';

  if v_themes is null and v_label <> 'MIX' then
    v_themes := array[v_label];
  end if;

  if v_themes is not null and array_length(v_themes, 1) > 1 then
    v_label := 'MIX';
  end if;

  if v_themes is not null and exists (
    select 1 from unnest(v_themes) c
    where not exists (select 1 from public.keep_battle_themes t where t.code = c and t.enabled = true)
  ) then
    raise exception 'BATTLE_THEME_UNAVAILABLE';
  end if;

  with ranked as (
    select t.id, t.title, t.artist, t.artwork_url, t.preview_url, random() as rnd
    from public.tracks t
    where t.preview_url is not null
      and t.preview_url <> ''
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
          select 1
          from public.playlists pl
          join public.playlist_tracks pt on pt.playlist_id=pl.id
          where pl.owner_id=v_uid and pt.track_id=t.id
        )
      )
  ), deduped as (
    select distinct on (lower(trim(artist))) id, title, artist, artwork_url, preview_url, rnd
    from ranked
    order by lower(trim(artist)), rnd
  ), candidates as (
    select id, title, artist, artwork_url, preview_url
    from deduped
    order by rnd
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
          select ranked.artist
          from (
            select artist, min(prio) as prio
            from (
              select trim(t2.artist) as artist, 0 as prio
              from public.tracks t2
              where trim(coalesce(t2.artist, '')) <> ''
                and lower(trim(t2.artist)) <> lower(trim(c.artist))
                and v_themes is not null
                and exists (select 1 from public.keep_battle_track_themes m2 where m2.track_id=t2.id and m2.theme_code = any(v_themes))
              union all
              select trim(t2.artist) as artist, 1 as prio
              from public.tracks t2
              where trim(coalesce(t2.artist, '')) <> ''
                and lower(trim(t2.artist)) <> lower(trim(c.artist))
                and exists (select 1 from public.keep_battle_track_themes m2b where m2b.track_id=t2.id)
            ) both_pools
            group by artist
            order by min(prio), random()
            limit 2
          ) ranked
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
