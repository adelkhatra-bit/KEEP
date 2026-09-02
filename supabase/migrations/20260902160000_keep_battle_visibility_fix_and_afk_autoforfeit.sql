-- Adel (02/09/2026) : "quand un utilisateur me recherche, comment ça se fait
-- que lorsque je suis déconnecté un utilisateur me voit" -- désactiver la
-- bascule manuelle ne touchait jamais `status`, qui reste 'AVAILABLE' si le
-- battement de coeur du mode solo actif l'a positionné juste avant. Résultat :
-- se "déconnecter" ne suffisait pas à disparaître tant qu'une partie solo
-- tournait encore en tâche de fond. On force maintenant `status` à repasser
-- à 'SOLO' dès que la bascule manuelle est désactivée.
create or replace function public.keep_battle_set_manual_available(p_available boolean, p_theme_code text DEFAULT 'MIX'::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_theme text := upper(coalesce(nullif(trim(p_theme_code),''),'MIX'));
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.keep_battle_themes where code=v_theme and enabled=true) then v_theme := 'MIX'; end if;
  insert into public.keep_battle_solo_presence(profile_id,theme_code,status,manual_available,last_seen_at)
  values(uid,v_theme,'SOLO',p_available,now())
  on conflict(profile_id) do update set
    manual_available = p_available,
    status = case when p_available then keep_battle_solo_presence.status else 'SOLO' end,
    theme_code = case when p_available then v_theme else keep_battle_solo_presence.theme_code end,
    last_seen_at = case when p_available then now() else keep_battle_solo_presence.last_seen_at end;
end;
$function$;

-- Adel : "lorsqu'il quitte une partie ou ne répond pas à des questions, le
-- système doit détecter que l'utilisateur est sorti de la partie au bout de
-- trois réponses où il n'a pas répondu, le système le sort et il a perdu
-- par défaut" -- compteur d'absences consécutives par siège, remis à zéro
-- dès qu'il répond (juste ou faux, peu importe), et forfait automatique
-- (mise perdue, éliminé) au bout de 3 manches sans réponse d'affilée.
alter table public.keep_battle_arena_members add column if not exists consecutive_misses integer not null default 0;

create or replace function public.keep_battle_arena_finalize_round(p_arena_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  a public.keep_battle_arenas%rowtype;
  r public.keep_battle_arena_rounds%rowtype;
  active_count integer;
  answer_count integer;
  stake integer;
  afk record;
begin
 select * into a from public.keep_battle_arenas where id=p_arena_id for update;
 if not found or a.status<>'ACTIVE' then return; end if;
 select * into r from public.keep_battle_arena_rounds where arena_id=a.id and match_no=a.match_no and position=a.current_round for update;
 if not found or r.finalized_at is not null then return; end if;
 select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
 select count(*) into answer_count from public.keep_battle_arena_answers where round_id=r.id;
 if answer_count<active_count and coalesce(r.closes_at,now()+interval '1 second')>now() then return; end if;

 update public.keep_battle_arena_answers
 set is_correct=(lower(trim(coalesce(selected_answer,'')))=lower(trim(r.artist_snapshot))),
     points=case when lower(trim(coalesce(selected_answer,'')))=lower(trim(r.artist_snapshot))
       then greatest(500, 1000 - round(least(coalesce(response_ms,10000),10000)::numeric / 10000 * 500)::int)
       else 0 end
 where round_id=r.id;

 update public.keep_battle_arena_members m
 set score=m.score+coalesce(z.points,0),
     correct_predictions=m.correct_predictions+case when z.is_correct then 1 else 0 end,
     total_response_ms=m.total_response_ms+case when z.is_correct then z.response_ms else 0 end
 from public.keep_battle_arena_answers z
 where m.arena_id=a.id and m.profile_id=z.profile_id and z.round_id=r.id and m.seat_status='ACTIVE';

 -- Absences : reset à 0 pour qui a répondu cette manche, incrémente pour qui
 -- n'a pas répondu du tout (indépendamment de bonne/mauvaise réponse).
 update public.keep_battle_arena_members m
 set consecutive_misses = 0
 where m.arena_id=a.id and m.seat_status='ACTIVE'
   and exists(select 1 from public.keep_battle_arena_answers z where z.round_id=r.id and z.profile_id=m.profile_id);

 update public.keep_battle_arena_members m
 set consecutive_misses = m.consecutive_misses + 1
 where m.arena_id=a.id and m.seat_status='ACTIVE'
   and not exists(select 1 from public.keep_battle_arena_answers z where z.round_id=r.id and z.profile_id=m.profile_id);

 stake := greatest(1, coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_stake_free_credits' limit 1),3));
 for afk in select profile_id from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE' and consecutive_misses>=3
 loop
   if exists(select 1 from public.keep_battle_arena_credit_holds where arena_id=a.id and match_no=a.match_no and profile_id=afk.profile_id and status='LOCKED') then
     insert into public.keep_battle_arena_credit_events(arena_id,match_no,profile_id,result,amount)
     values(a.id,a.match_no,afk.profile_id,'LOSS',-stake)
     on conflict(arena_id,match_no,profile_id) do nothing;
     update public.keep_battle_arena_credit_holds set status='SETTLED',settled_at=now() where arena_id=a.id and match_no=a.match_no and profile_id=afk.profile_id and status='LOCKED';
   end if;
   update public.keep_battle_arena_members set seat_status='ELIMINATED' where arena_id=a.id and profile_id=afk.profile_id;
   insert into public.notifications(profile_id,type,title,body,data)
   values(afk.profile_id,'BATTLE_ARENA_AFK_ELIMINATED','⚡ Battle KEEP','Tu as manqué 3 questions d’affilée : tu es sorti de la partie et as perdu ta mise.',jsonb_build_object('arenaId',a.id,'matchNo',a.match_no));
 end loop;

 update public.keep_battle_arena_rounds
 set finalized_at=now(),
     reveal_until=greatest(now()+interval '2800 milliseconds', coalesce(r.closes_at,now())+interval '800 milliseconds')
 where id=r.id;

 select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
 if active_count<2 then
   perform public.keep_battle_arena_finish_match(a.id);
 end if;
end;
$function$;
