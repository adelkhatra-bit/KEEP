-- Adel (03/09/2026) : "il doit attendre que la piste se termine et ensuite
-- il rentre avec moi" -- un spectateur qui appuie sur "+" pendant un match en
-- cours (keep_battle_arena_join -> seat_status='QUEUED') n'etait promu ACTIF
-- qu'a la toute fin du match ENTIER (keep_battle_arena_finish_match, apres
-- les 15/20/30 manches) -- jamais entre deux pistes comme demande. On
-- reprend exactement la meme logique de promotion (file d'attente, blocage
-- de mise, notification) mais declenchee a CHAQUE passage de manche,
-- directement dans keep_battle_arena_advance_after_reveal.
create or replace function public.keep_battle_arena_advance_after_reveal(p_arena_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  a public.keep_battle_arenas%rowtype;
  r public.keep_battle_arena_rounds%rowtype;
  next_round integer;
  round_start timestamptz;
  active_count integer;
  candidate uuid;
  stake integer;
begin
  select * into a from public.keep_battle_arenas where id=p_arena_id for update;
  if not found or a.status<>'ACTIVE' then return; end if;
  select * into r from public.keep_battle_arena_rounds where arena_id=a.id and match_no=a.match_no and position=a.current_round for update;
  if not found or r.finalized_at is null or coalesce(r.reveal_until,now()+interval '1 second')>now() then return; end if;
  next_round:=a.current_round+1;
  if next_round>a.round_count then perform public.keep_battle_arena_finish_match(a.id); return; end if;

  -- Adel (03/09/2026) : promotion QUEUED -> ACTIVE entre deux pistes du MEME
  -- match, tant qu'il reste une place libre. Le nouvel arrivant commence a
  -- 0 point a partir de la prochaine manche -- il ne peut logiquement pas
  -- avoir de score sur des manches deja jouees avant son arrivee.
  stake:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_stake_free_credits' limit 1),3));
  loop
    select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
    exit when active_count>=a.max_players;
    select profile_id into candidate from public.keep_battle_arena_members where arena_id=a.id and seat_status='QUEUED' order by joined_at asc limit 1 for update skip locked;
    exit when candidate is null;
    if public.keep_battle_arena_lock_stake(a.id,a.match_no,candidate) then
      update public.keep_battle_arena_members set seat_status='ACTIVE',score=0,correct_predictions=0,total_response_ms=0,placement=null,consecutive_misses=0 where arena_id=a.id and profile_id=candidate;
      insert into public.notifications(profile_id,type,title,body,data) values(candidate,'BATTLE_ARENA_PROMOTED','🔥 Tu rejoins le Battle','La piste est terminée : tu entres dans le match dès la prochaine.',jsonb_build_object('arenaId',a.id,'matchNo',a.match_no,'stakeFree',stake));
    else
      update public.keep_battle_arena_members set seat_status='ELIMINATED' where arena_id=a.id and profile_id=candidate;
    end if;
  end loop;

  update public.keep_battle_arenas set current_round=next_round,updated_at=now() where id=a.id;
  round_start:=now()+interval '3 seconds';
  update public.keep_battle_arena_rounds set started_at=round_start,closes_at=round_start+interval '10 seconds',reveal_until=null where arena_id=a.id and match_no=a.match_no and position=next_round;
end;$function$;
