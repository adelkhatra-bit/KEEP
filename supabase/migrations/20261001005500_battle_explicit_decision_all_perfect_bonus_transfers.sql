-- 01/10/2026 — Battle consent explicite + bonus pour CHAQUE sans-faute.
--
-- Règles :
-- 1) une invitation/revanche reste en attente jusqu'à ACCEPTER ou REFUSER ;
-- 2) aucun timeout ne décide à la place d'un utilisateur ;
-- 3) chaque joueur parfait N/N en Arena reçoit un bonus Loki égal à la mise ;
-- 4) le ledger financier reste append-only ;
-- 5) les notifications disent qui a reçu les Free perdus / d'où viennent les Free gagnés.
--
-- Les migrations 02000/03500/04500 restent immuables. Celle-ci remplace
-- uniquement la règle "fastest perfect only" pour les futurs matchs.

-- ---------------------------------------------------------------------------
-- A. Invitations fraîches : conserver expires_at pour compatibilité, mais
--    l'éloigner afin que le choix humain soit la vraie condition de sortie.
-- ---------------------------------------------------------------------------

create or replace function public.keep_battle_pending_requires_decision()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.status='PENDING' then
    new.expires_at:=greatest(coalesce(new.expires_at,now()),now()+interval '100 years');
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_keep_battle_pending_requires_decision on public.keep_battle_challenges;
create trigger trg_keep_battle_pending_requires_decision
before insert or update of status,expires_at on public.keep_battle_challenges
for each row
execute function public.keep_battle_pending_requires_decision();

update public.keep_battle_challenges
set expires_at=now()+interval '100 years',updated_at=now()
where status='PENDING';

-- ---------------------------------------------------------------------------
-- B. Bonus parfait append-only : une ligne PAR profil parfait et par match.
-- ---------------------------------------------------------------------------

alter table public.keep_battle_perfect_bonus_events
  drop constraint if exists keep_battle_perfect_bonus_events_arena_id_match_no_key;

alter table public.keep_battle_perfect_bonus_events
  add constraint keep_battle_perfect_bonus_events_arena_match_profile_key
  unique (arena_id,match_no,profile_id);

drop trigger if exists keep_battle_fastest_perfect_bonus on public.keep_battle_arenas;
drop function if exists public.keep_battle_apply_fastest_perfect_bonus();

create or replace function public.keep_battle_apply_all_perfect_bonuses()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  participant_count integer:=0;
  stake integer:=0;
  legacy_duel_bonus integer:=0;
  match_winner uuid;
  winner_name text:='Loki';
  loser_names text:='';
  evt record;
  base_delta integer:=0;
  separate_bonus integer:=0;
  embedded_bonus integer:=0;
  total_bonus integer:=0;
  net_delta integer:=0;
  transfer_body text;
begin
  if not (
    old.status='ACTIVE'
    and new.status='WAITING'
    and new.match_no=old.match_no+1
  ) then
    return new;
  end if;

  select count(*)::integer into participant_count
  from public.keep_battle_arena_match_results r
  where r.arena_id=old.id and r.match_no=old.match_no;

  if participant_count<2 then
    return new;
  end if;

  stake:=public.keep_battle_stake_for_rounds(old.round_count);
  legacy_duel_bonus:=greatest(
    0,
    coalesce(
      (select (value #>> '{}')::integer
       from public.remote_config
       where key='battle_duel_perfect_bonus_free'
       limit 1),
      3
    )
  );

  select r.profile_id into match_winner
  from public.keep_battle_arena_match_results r
  where r.arena_id=old.id and r.match_no=old.match_no
  order by r.placement asc
  limit 1;

  select coalesce(nullif(p.username,''),'Loki') into winner_name
  from public.profiles p
  where p.id=match_winner;

  -- Le finish_match de production contient encore l'ancien bonus duel fixe
  -- pour le gagnant parfait d'un 1v1. On ne modifie jamais cet ancien ledger.
  -- On ajoute seulement le complément nécessaire pour atteindre "bonus = mise".
  insert into public.keep_battle_perfect_bonus_events(
    arena_id,match_no,profile_id,round_count,response_ms,amount
  )
  select
    old.id,
    old.match_no,
    r.profile_id,
    old.round_count,
    greatest(0,r.total_response_ms),
    case
      when participant_count=2 and r.profile_id=match_winner
        then greatest(0,stake-legacy_duel_bonus)
      else stake
    end
  from public.keep_battle_arena_match_results r
  where r.arena_id=old.id
    and r.match_no=old.match_no
    and r.correct_predictions=old.round_count
    and (
      case
        when participant_count=2 and r.profile_id=match_winner
          then greatest(0,stake-legacy_duel_bonus)
        else stake
      end
    )>0
  on conflict(arena_id,match_no,profile_id) do nothing;

  -- Chaque parfait est informé, y compris le gagnant 1v1 dont le bonus
  -- historique est déjà inclus dans keep_battle_arena_credit_events.
  insert into public.notifications(profile_id,type,title,body,data)
  select
    r.profile_id,
    'BATTLE_PERFECT_BONUS',
    '✨ Sans-faute · bonus Loki',
    format(
      '%s/%s parfait : +%s Free bonus, égal à la mise de ce Battle.',
      old.round_count,old.round_count,stake
    ),
    jsonb_build_object(
      'arenaId',old.id,
      'matchNo',old.match_no,
      'perfectScore',old.round_count,
      'perfectBonusFree',stake,
      'perfectBonusProfileId',r.profile_id,
      'rule','ALL_PERFECT_PLAYERS'
    )
  from public.keep_battle_arena_match_results r
  where r.arena_id=old.id
    and r.match_no=old.match_no
    and r.correct_predictions=old.round_count
    and not exists(
      select 1
      from public.notifications n
      where n.profile_id=r.profile_id
        and n.type='BATTLE_PERFECT_BONUS'
        and n.data->>'arenaId'=old.id::text
        and n.data->>'matchNo'=old.match_no::text
    );

  select coalesce(
    string_agg('@'||coalesce(nullif(p.username,''),'Loki'),', ' order by p.username),
    ''
  ) into loser_names
  from public.keep_battle_arena_credit_events e
  join public.profiles p on p.id=e.profile_id
  where e.arena_id=old.id
    and e.match_no=old.match_no
    and e.result='LOSS';

  -- Notification de transfert : pas de mutation du ledger existant.
  for evt in
    select e.profile_id,e.result,e.amount
    from public.keep_battle_arena_credit_events e
    where e.arena_id=old.id and e.match_no=old.match_no
  loop
    select coalesce(sum(b.amount),0)::integer into separate_bonus
    from public.keep_battle_perfect_bonus_events b
    where b.arena_id=old.id
      and b.match_no=old.match_no
      and b.profile_id=evt.profile_id;

    embedded_bonus:=0;
    if participant_count=2
       and evt.profile_id=match_winner
       and exists(
         select 1
         from public.keep_battle_arena_match_results r
         where r.arena_id=old.id
           and r.match_no=old.match_no
           and r.profile_id=evt.profile_id
           and r.correct_predictions=old.round_count
       )
    then
      embedded_bonus:=legacy_duel_bonus;
    end if;

    total_bonus:=embedded_bonus+separate_bonus;
    base_delta:=evt.amount-embedded_bonus;
    net_delta:=evt.amount+separate_bonus;

    if evt.result='WIN' then
      transfer_body:=format(
        '+%s Free au total. +%s vient des mises de %s.%s',
        net_delta,
        base_delta,
        coalesce(nullif(loser_names,''),'tes adversaires'),
        case
          when total_bonus>0
            then format(' Bonus sans-faute : +%s Free offerts par Loki.',total_bonus)
          else ''
        end
      );
    else
      transfer_body:=format(
        'Ta mise de %s Free a été reversée à @%s.%s Solde net de ce Battle : %s Free.',
        abs(base_delta),
        coalesce(winner_name,'Loki'),
        case
          when total_bonus>0
            then format(' Bonus sans-faute : +%s Free offerts par Loki.',total_bonus)
          else ''
        end,
        net_delta
      );
    end if;

    insert into public.notifications(profile_id,type,title,body,data)
    values(
      evt.profile_id,
      'BATTLE_FREE_TRANSFER',
      case
        when evt.result='WIN' then '🎁 Free reçus du Battle'
        else '🎁 Free reversés du Battle'
      end,
      transfer_body,
      jsonb_build_object(
        'arenaId',old.id,
        'matchNo',old.match_no,
        'creditDelta',net_delta,
        'baseCreditDelta',base_delta,
        'perfectBonusFree',total_bonus,
        'result',evt.result,
        'transferTo',match_winner,
        'transferToUsername',winner_name,
        'transferFrom',loser_names
      )
    );
  end loop;

  return new;
end;
$function$;

revoke all on function public.keep_battle_apply_all_perfect_bonuses()
from public,anon,authenticated;

create trigger keep_battle_all_perfect_bonuses
after update of status,match_no on public.keep_battle_arenas
for each row
execute function public.keep_battle_apply_all_perfect_bonuses();

-- ---------------------------------------------------------------------------
-- C. Revanche : jamais de refus implicite par timeout.
-- ---------------------------------------------------------------------------

alter table public.keep_battle_arenas
  add column if not exists rematch_proposer_id uuid
  references public.profiles(id) on delete set null;

create or replace function public.keep_battle_arena_propose_rematch(p_arena_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid:=auth.uid();
  a public.keep_battle_arenas%rowtype;
  my_name text;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into a
  from public.keep_battle_arenas
  where id=p_arena_id
  for update;

  if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
  if a.status<>'WAITING' or a.match_no<=1 then
    raise exception 'BATTLE_ARENA_NOT_READY_FOR_REMATCH';
  end if;

  if not exists(
    select 1
    from public.keep_battle_arena_match_results r
    where r.arena_id=a.id
      and r.match_no=a.match_no-1
      and r.profile_id=uid
  ) then
    raise exception 'BATTLE_ARENA_FORBIDDEN';
  end if;

  if a.rematch_deadline is not null then
    if a.rematch_proposer_id=uid then
      return public.keep_battle_arena_state(a.id);
    end if;
    raise exception 'BATTLE_REMATCH_ALREADY_PENDING';
  end if;

  update public.keep_battle_arena_members m
  set rematch_ready=case when m.profile_id=uid then true else null end
  where m.arena_id=a.id
    and exists(
      select 1
      from public.keep_battle_arena_match_results r
      where r.arena_id=a.id
        and r.match_no=a.match_no-1
        and r.profile_id=m.profile_id
    );

  update public.keep_battle_arenas
  set rematch_deadline=now()+interval '100 years',
      rematch_proposer_id=uid,
      updated_at=now()
  where id=a.id;

  select coalesce(nullif(username,''),'Loki')
  into my_name
  from public.profiles
  where id=uid;

  insert into public.notifications(profile_id,type,title,body,data)
  select
    r.profile_id,
    'BATTLE_ARENA_REMATCH',
    '🔁 Revanche proposée',
    format(
      '@%s propose une revanche. Accepte ou refuse : la demande reste affichée jusqu’à ta réponse.',
      my_name
    ),
    jsonb_build_object(
      'arenaId',a.id,
      'arenaCode',a.arena_code,
      'proposerId',uid,
      'presentation','battle_inline',
      'decisionRequired',true
    )
  from public.keep_battle_arena_match_results r
  where r.arena_id=a.id
    and r.match_no=a.match_no-1
    and r.profile_id<>uid;

  return public.keep_battle_arena_state(a.id);
end;
$function$;

create or replace function public.keep_battle_arena_rematch_respond(
  p_arena_id uuid,
  p_ready boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid:=auth.uid();
  a public.keep_battle_arenas%rowtype;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into a
  from public.keep_battle_arenas
  where id=p_arena_id
  for update;

  if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;

  if not exists(
    select 1
    from public.keep_battle_arena_match_results r
    where r.arena_id=a.id
      and r.match_no=a.match_no-1
      and r.profile_id=uid
  ) then
    raise exception 'BATTLE_ARENA_FORBIDDEN';
  end if;

  if a.rematch_deadline is null then
    return public.keep_battle_arena_state(a.id);
  end if;

  update public.keep_battle_arena_members
  set rematch_ready=p_ready
  where arena_id=a.id and profile_id=uid;

  perform public.keep_battle_arena_finalize_rematch(a.id);
  return public.keep_battle_arena_state(a.id);
end;
$function$;

create or replace function public.keep_battle_arena_finalize_rematch(p_arena_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  a public.keep_battle_arenas%rowtype;
  active_count integer:=0;
  undecided_count integer:=0;
begin
  select * into a
  from public.keep_battle_arenas
  where id=p_arena_id
  for update;

  if not found
     or a.status<>'WAITING'
     or a.rematch_deadline is null
  then
    return;
  end if;

  select count(*) into undecided_count
  from public.keep_battle_arena_members m
  where m.arena_id=a.id
    and m.rematch_ready is null
    and exists(
      select 1
      from public.keep_battle_arena_match_results r
      where r.arena_id=a.id
        and r.match_no=a.match_no-1
        and r.profile_id=m.profile_id
    );

  -- Règle produit : aucun compteur ne répond à la place du joueur.
  if undecided_count>0 then return; end if;

  update public.keep_battle_arena_members m
  set seat_status='ACTIVE'
  where m.arena_id=a.id
    and m.rematch_ready=true
    and exists(
      select 1
      from public.keep_battle_arena_match_results r
      where r.arena_id=a.id
        and r.match_no=a.match_no-1
        and r.profile_id=m.profile_id
    );

  update public.keep_battle_arena_members m
  set seat_status='ELIMINATED'
  where m.arena_id=a.id
    and m.rematch_ready=false
    and exists(
      select 1
      from public.keep_battle_arena_match_results r
      where r.arena_id=a.id
        and r.match_no=a.match_no-1
        and r.profile_id=m.profile_id
    );

  update public.keep_battle_arena_members m
  set rematch_ready=null
  where m.arena_id=a.id
    and exists(
      select 1
      from public.keep_battle_arena_match_results r
      where r.arena_id=a.id
        and r.match_no=a.match_no-1
        and r.profile_id=m.profile_id
    );

  update public.keep_battle_arenas
  set rematch_deadline=null,
      rematch_proposer_id=null,
      updated_at=now()
  where id=a.id;

  select count(*) into active_count
  from public.keep_battle_arena_members
  where arena_id=a.id and seat_status='ACTIVE';

  if active_count>=2 then
    perform public.keep_battle_arena_start(a.id);
  end if;
end;
$function$;

create or replace function public.keep_battle_arena_pending_rematch_for_me()
returns table(
  arena_id uuid,
  arena_code text,
  theme_code text,
  rematch_deadline timestamptz,
  participant_usernames text[]
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    a.id,
    a.arena_code,
    a.theme_code,
    a.rematch_deadline,
    (
      select array_agg(
        coalesce(nullif(p2.username,''),'Loki')
        order by p2.username
      )
      from public.keep_battle_arena_members m2
      join public.profiles p2 on p2.id=m2.profile_id
      where m2.arena_id=a.id
        and m2.profile_id<>auth.uid()
    )
  from public.keep_battle_arenas a
  join public.keep_battle_arena_members me
    on me.arena_id=a.id
   and me.profile_id=auth.uid()
  where a.status='WAITING'
    and a.rematch_deadline is not null
    and me.rematch_ready is null
    and exists(
      select 1
      from public.keep_battle_arena_match_results r
      where r.arena_id=a.id
        and r.match_no=a.match_no-1
        and r.profile_id=auth.uid()
    );
$function$;

create or replace function public.keep_battle_arena_cancel_rematch(p_arena_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid:=auth.uid();
  a public.keep_battle_arenas%rowtype;
  accepted_others integer:=0;
  my_name text;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into a
  from public.keep_battle_arenas
  where id=p_arena_id
  for update;

  if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
  if a.rematch_deadline is null then
    return public.keep_battle_arena_state(a.id);
  end if;
  if a.rematch_proposer_id is distinct from uid then
    raise exception 'BATTLE_REMATCH_CANCEL_FORBIDDEN';
  end if;

  select count(*) into accepted_others
  from public.keep_battle_arena_members m
  where m.arena_id=a.id
    and m.profile_id<>uid
    and m.rematch_ready=true
    and exists(
      select 1
      from public.keep_battle_arena_match_results r
      where r.arena_id=a.id
        and r.match_no=a.match_no-1
        and r.profile_id=m.profile_id
    );

  if accepted_others>0 then
    raise exception 'BATTLE_REMATCH_ALREADY_ACCEPTED';
  end if;

  update public.keep_battle_arena_members m
  set rematch_ready=null
  where m.arena_id=a.id
    and exists(
      select 1
      from public.keep_battle_arena_match_results r
      where r.arena_id=a.id
        and r.match_no=a.match_no-1
        and r.profile_id=m.profile_id
    );

  update public.keep_battle_arenas
  set rematch_deadline=null,
      rematch_proposer_id=null,
      updated_at=now()
  where id=a.id;

  select coalesce(nullif(username,''),'Loki')
  into my_name
  from public.profiles
  where id=uid;

  insert into public.notifications(profile_id,type,title,body,data)
  select
    r.profile_id,
    'BATTLE_ARENA_REMATCH_CANCELLED',
    'Revanche retirée',
    format('@%s a retiré sa demande de revanche.',my_name),
    jsonb_build_object(
      'arenaId',a.id,
      'arenaCode',a.arena_code,
      'proposerId',uid
    )
  from public.keep_battle_arena_match_results r
  where r.arena_id=a.id
    and r.match_no=a.match_no-1
    and r.profile_id<>uid;

  return public.keep_battle_arena_state(a.id);
end;
$function$;

update public.keep_battle_arenas
set rematch_deadline=now()+interval '100 years',
    updated_at=now()
where status='WAITING'
  and rematch_deadline is not null;

-- ---------------------------------------------------------------------------
-- D. Règles exposées à l'écran Offres.
-- ---------------------------------------------------------------------------

create or replace function public.keep_battle_arena_rules(p_round_count integer default 8)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  stake integer:=3;
  max_players integer:=10;
begin
  stake:=public.keep_battle_stake_for_rounds(p_round_count);
  max_players:=least(
    10,
    greatest(
      2,
      coalesce(
        (select (value #>> '{}')::integer
         from public.remote_config
         where key='battle_arena_max_players'
         limit 1),
        10
      )
    )
  );

  return jsonb_build_object(
    'stakeFree',stake,
    'minimumFreeRequired',stake,
    'maxPlayers',max_players,
    'singleWinner',true,
    'answerLockedOnTap',true,
    'ranking','CORRECT_ANSWERS_THEN_SPEED',
    'fullArenaNetPrize',stake*greatest(0,max_players-1)+stake,
    'perfectScoreBonusFree',stake,
    'perfectDuelBonusFree',stake,
    'ruleText',
      format(
        'Le gagnant reçoit les mises perdues par ses adversaires. Chaque joueur qui réussit %s/%s reçoit en plus +%s Free bonus Loki, égal à la mise du Battle.',
        p_round_count,p_round_count,stake
      )
  );
end;
$function$;

insert into public.remote_config(key,value,description)
values(
  'battle_perfect_bonus_equals_stake',
  'true'::jsonb,
  'Tout Battle en ligne : chaque score parfait reçoit un bonus Loki égal à la mise du format.'
)
on conflict(key) do update
set value=excluded.value,
    description=excluded.description;

update public.remote_config
set description='Clé duel historique conservée pour compatibilité. Règle active : chaque sans-faute en Battle en ligne reçoit un bonus égal à la mise.'
where key='battle_duel_perfect_bonus_free';

grant execute on function public.keep_battle_arena_propose_rematch(uuid) to authenticated;
grant execute on function public.keep_battle_arena_rematch_respond(uuid,boolean) to authenticated;
grant execute on function public.keep_battle_arena_cancel_rematch(uuid) to authenticated;
grant execute on function public.keep_battle_arena_pending_rematch_for_me() to authenticated;
revoke all on function public.keep_battle_arena_rules(integer) from public;
grant execute on function public.keep_battle_arena_rules(integer) to anon,authenticated;
