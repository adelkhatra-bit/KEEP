-- Adel (03/09/2026) : "une musique arabe et deux noms d'artistes français et
-- un nom arabe, du coup on devine la réponse" -- vrai trou de conception :
-- les 2 mauvaises réponses (leurres) étaient piochées au hasard dans TOUT le
-- catalogue, sans tenir compte du style de la manche. Un leurre dont la
-- sonorité/l'origine ne colle manifestement pas au thème (ex: Rap FR/US
-- mélangé à une manche Arabe/Chanson FR) rend la bonne réponse devinable
-- sans même écouter. Les leurres viennent désormais EN PRIORITÉ d'artistes
-- du MÊME style que la manche (keep_battle_track_themes), avec repli
-- automatique sur le catalogue global seulement si pas assez d'artistes du
-- même style existent (évite un blocage sur un style au catalogue mince).
-- Le style MIX reste inchangé (aucune contrainte de genre, cohérent avec son
-- rôle volontairement transversal).
create or replace function public.keep_battle_solo_pack(p_theme_code text DEFAULT 'MIX'::text, p_round_count integer DEFAULT 8)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_theme text := upper(trim(coalesce(p_theme_code, 'MIX')));
  v_round_count integer := greatest(5, least(coalesce(p_round_count, 8), 30));
  v_rounds jsonb;
begin
  if v_theme = '' then v_theme := 'MIX'; end if;
  if v_theme <> 'MIX' and not exists (
    select 1 from public.keep_battle_themes t where t.code = v_theme and t.enabled = true
  ) then
    raise exception 'BATTLE_THEME_UNAVAILABLE';
  end if;

  with candidates as (
    select t.id, t.title, t.artist, t.artwork_url, t.preview_url
    from public.tracks t
    where t.preview_url is not null
      and t.preview_url <> ''
      and trim(coalesce(t.title, '')) <> ''
      and trim(coalesce(t.artist, '')) <> ''
      and (
        v_theme = 'MIX'
        or exists (
          select 1 from public.keep_battle_track_themes m
          where m.track_id = t.id and m.theme_code = v_theme
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
    order by random()
    limit v_round_count
  ), packed as (
    select
      row_number() over ()::integer as position,
      c.id, c.title, c.artist, c.artwork_url, c.preview_url,
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
                and v_theme <> 'MIX'
                and exists (select 1 from public.keep_battle_track_themes m2 where m2.track_id=t2.id and m2.theme_code=v_theme)
              union all
              select trim(t2.artist) as artist, 1 as prio
              from public.tracks t2
              where trim(coalesce(t2.artist, '')) <> ''
                and lower(trim(t2.artist)) <> lower(trim(c.artist))
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
      'choices', p.choices,
      'correctAnswer', p.artist
    ) order by p.position
  ) into v_rounds
  from packed p;

  if jsonb_array_length(coalesce(v_rounds, '[]'::jsonb)) < 5 then
    raise exception 'BATTLE_THEME_CATALOG_TOO_SMALL:%', v_theme;
  end if;

  return jsonb_build_object(
    'mode', 'SOLO_TRAINING',
    'themeCode', v_theme,
    'roundCount', jsonb_array_length(v_rounds),
    'stakeFree', 0,
    'rewardFree', 0,
    'rounds', v_rounds
  );
end;
$function$;

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
begin
 select * into a from public.keep_battle_arenas where id=p_arena_id;
 if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
 delete from public.keep_battle_arena_rounds where arena_id=a.id and match_no=p_match_no;

 with candidates as(
  select t.id,t.title,t.artist,t.artwork_url,t.preview_url,t.release_year
  from public.tracks t
  where t.preview_url is not null and t.preview_url<>''
    and trim(coalesce(t.title,''))<>''
    and trim(coalesce(t.artist,''))<>''
    and (
      a.theme_code='MIX'
      or exists(select 1 from public.keep_battle_track_themes m where m.track_id=t.id and m.theme_code=a.theme_code)
    )
    and not exists (
      select 1
      from public.keep_battle_arena_members am
      join public.playlists p on p.owner_id=am.profile_id
      join public.playlist_tracks pt on pt.playlist_id=p.id
      where am.arena_id=a.id and am.seat_status='ACTIVE' and pt.track_id=t.id
    )
  order by md5(t.id::text||a.id::text||p_match_no::text||a.theme_code)
  limit a.round_count
 )
 insert into public.keep_battle_arena_rounds(arena_id,match_no,position,track_id,title_snapshot,artist_snapshot,artwork_url,preview_url,release_year_snapshot)
 select a.id,p_match_no,row_number()over()::smallint,id,title,artist,artwork_url,preview_url,release_year from candidates;
 get diagnostics inserted=row_count;
 if inserted<5 then raise exception 'BATTLE_CATALOG_TOO_SMALL'; end if;

 for rr in
   select id,position,artist_snapshot
   from public.keep_battle_arena_rounds
   where arena_id=a.id and match_no=p_match_no
   order by position
 loop
   -- Adel (03/09/2026) : mêmes leurres priorisés par style que le solo --
   -- artistes du même thème d'abord, repli sur le catalogue global seulement
   -- si pas assez d'artistes du même style (jamais de manche bloquée).
   select artist into d1 from (
     select artist, min(prio) as prio from (
       select trim(artist) as artist, 0 as prio
       from public.tracks t3
       where trim(coalesce(artist,''))<>'' and lower(trim(artist))<>lower(trim(rr.artist_snapshot))
         and a.theme_code<>'MIX'
         and exists(select 1 from public.keep_battle_track_themes m3 where m3.track_id=t3.id and m3.theme_code=a.theme_code)
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
         and a.theme_code<>'MIX'
         and exists(select 1 from public.keep_battle_track_themes m4 where m4.track_id=t4.id and m4.theme_code=a.theme_code)
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
