-- Loki Music Battle: classement actionnable + mouvements de rang + compteurs d'abandon.
-- Réutilise les classements, notifications et keep_battle_abandons existants.

create table if not exists public.keep_battle_solo_rank_state (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  last_rank integer,
  updated_at timestamptz not null default now()
);

alter table public.keep_battle_solo_rank_state enable row level security;
revoke all on table public.keep_battle_solo_rank_state from anon, authenticated;

create or replace function public.keep_battle_sync_my_solo_rank()
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  payload jsonb;
  current_rank integer;
  previous_rank integer;
  inserted_rows integer := 0;
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  payload := public.keep_battle_my_solo_rank();
  current_rank := nullif(payload->>'rank', '')::integer;

  insert into public.keep_battle_solo_rank_state(profile_id, last_rank, updated_at)
  values (uid, current_rank, now())
  on conflict (profile_id) do nothing;
  get diagnostics inserted_rows = row_count;

  if inserted_rows > 0 then
    return payload || jsonb_build_object('rankChanged', false, 'previousRank', null);
  end if;

  select s.last_rank
    into previous_rank
  from public.keep_battle_solo_rank_state s
  where s.profile_id = uid
  for update;

  if previous_rank is distinct from current_rank then
    update public.keep_battle_solo_rank_state
       set last_rank = current_rank,
           updated_at = now()
     where profile_id = uid;

    if previous_rank is not null and current_rank is not null and not exists (
      select 1
      from public.notifications n
      where n.profile_id = uid
        and n.type in ('SOLO_RANK_UP', 'BATTLE_SOLO_RANK_CHANGED')
        and n.created_at > now() - interval '10 minutes'
        and nullif(n.data->>'oldRank', '')::integer = previous_rank
        and nullif(n.data->>'newRank', '')::integer = current_rank
    ) then
      insert into public.notifications(
        profile_id, type, title, body, data, push_delivery_status, push_attempt_count
      )
      values (
        uid,
        'BATTLE_SOLO_RANK_CHANGED',
        case when current_rank < previous_rank
          then '🏆 Tu montes au classement'
          else '🏆 Ton classement a bougé'
        end,
        case when current_rank < previous_rank
          then format('Ton rang Solo passe de #%s à #%s. Appuie pour ouvrir le classement.', previous_rank, current_rank)
          else format('Ton rang Solo passe de #%s à #%s. Continue à jouer pour remonter.', previous_rank, current_rank)
        end,
        jsonb_build_object(
          'event', 'BATTLE_SOLO_RANK_CHANGED',
          'oldRank', previous_rank,
          'newRank', current_rank,
          'delta', previous_rank - current_rank,
          'openBattleRanking', true,
          'soundKind', 'battle'
        ),
        'CREATED',
        0
      );
    end if;
  end if;

  return payload || jsonb_build_object(
    'rankChanged', previous_rank is distinct from current_rank,
    'previousRank', previous_rank
  );
end;
$function$;

revoke all on function public.keep_battle_sync_my_solo_rank() from public;
grant execute on function public.keep_battle_sync_my_solo_rank() to authenticated;

create or replace function public.keep_battle_profile_battle_stats_daily(
  p_profile_id uuid,
  p_theme_limit integer default 3,
  p_timezone text default 'Europe/Paris'
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  result jsonb;
  v_tz text := coalesce(nullif(trim(p_timezone),''),'Europe/Paris');
  v_local_start timestamp without time zone;
  v_local_end timestamp without time zone;
  v_start timestamptz;
  v_end timestamptz;
  v_battle_abandons integer := 0;
  v_solo_abandons integer := 0;
begin
  if p_profile_id is null then raise exception 'PROFILE_REQUIRED'; end if;
  if uid is distinct from p_profile_id and not exists (
    select 1 from public.profiles p where p.id=p_profile_id and p.is_public=true
  ) then
    raise exception 'PROFILE_NOT_PUBLIC';
  end if;

  if not exists (select 1 from pg_timezone_names where name=v_tz) then
    v_tz := 'Europe/Paris';
  end if;

  v_local_start := date_trunc('day', (now() at time zone v_tz) - interval '2 hours') + interval '2 hours';
  v_local_end := v_local_start + interval '1 day';
  v_start := v_local_start at time zone v_tz;
  v_end := v_local_end at time zone v_tz;

  select count(*)::integer
    into v_battle_abandons
  from public.keep_battle_abandons a
  where a.profile_id = p_profile_id;

  select greatest(
    0,
    coalesce(sum(u.starts), 0)::integer
      - (select count(*)::integer from public.keep_battle_solo_history h where h.profile_id = p_profile_id)
  )
    into v_solo_abandons
  from public.keep_battle_solo_daily_usage u
  where u.profile_id = p_profile_id;

  with mine as (
    select r.*, a.theme_code
    from public.keep_battle_arena_match_results r
    join public.keep_battle_arenas a on a.id=r.arena_id
    where r.profile_id=p_profile_id
  ), totals as (
    select count(*) filter(where placement=1) as wins,
      count(*) as matches_played,
      coalesce(sum(score),0) as total_score,
      coalesce(sum(correct_predictions),0) as total_correct,
      case when sum(correct_predictions)>0 then
        (sum(total_response_ms)/greatest(1,sum(correct_predictions)))::integer
      else null end as avg_response_ms
    from mine
  ), by_theme as (
    select theme_code,count(*) filter(where placement=1) as wins,count(*) as matches
    from mine
    group by theme_code
    order by wins desc,matches desc
    limit greatest(1,least(coalesce(p_theme_limit,3),10))
  ), day_credit as (
    select
      coalesce(sum(amount) filter(where amount>0),0)::integer as free_won,
      coalesce(abs(sum(amount) filter(where amount<0)),0)::integer as free_lost,
      coalesce(sum(amount),0)::integer as free_net
    from (
      select amount,created_at from public.keep_battle_credit_events where profile_id=p_profile_id
      union all
      select amount,created_at from public.keep_battle_arena_credit_events where profile_id=p_profile_id
      union all
      select amount,created_at from public.keep_battle_solo_credit_events where profile_id=p_profile_id
      union all
      select amount,created_at from public.keep_battle_perfect_bonus_events where profile_id=p_profile_id
    ) e
    where e.created_at>=v_start and e.created_at<v_end
  )
  select jsonb_build_object(
    'wins',(select wins from totals),
    'matchesPlayed',(select matches_played from totals),
    'totalScore',(select total_score from totals),
    'totalCorrect',(select total_correct from totals),
    'avgResponseMs',(select avg_response_ms from totals),
    'topThemes',coalesce((select jsonb_agg(jsonb_build_object('themeCode',theme_code,'wins',wins,'matches',matches)) from by_theme),'[]'::jsonb),
    'followers',(select count(*)::integer from public.follows f where f.followee_id=p_profile_id),
    'freeBalance',public.keep_theoretical_free_credit_remaining_for_profile(p_profile_id),
    'freeWon',(select free_won from day_credit),
    'freeLost',(select free_lost from day_credit),
    'freeNet',(select free_net from day_credit),
    'battleAbandons',coalesce(v_battle_abandons,0),
    'soloAbandons',coalesce(v_solo_abandons,0),
    'abandons',coalesce(v_battle_abandons,0)+coalesce(v_solo_abandons,0),
    'freePeriod','TODAY_2AM',
    'freePeriodTimezone',v_tz,
    'freePeriodStartedAt',v_start,
    'freePeriodEndsAt',v_end
  ) into result;

  return result;
end;
$function$;
