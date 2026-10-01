-- Battle profile FREE counters are daily, not lifetime totals.
-- Logical day: 02:00 -> 01:59:59 in the viewer/device timezone.
create or replace function public.keep_battle_profile_battle_stats_daily(
  p_profile_id uuid,
  p_theme_limit integer default 3,
  p_timezone text default 'Europe/Paris'
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $function$
declare
  uid uuid := auth.uid();
  result jsonb;
  v_tz text := coalesce(nullif(trim(p_timezone),''),'Europe/Paris');
  v_local_start timestamp without time zone;
  v_local_end timestamp without time zone;
  v_start timestamptz;
  v_end timestamptz;
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
    'freePeriod','TODAY_2AM',
    'freePeriodTimezone',v_tz,
    'freePeriodStartedAt',v_start,
    'freePeriodEndsAt',v_end
  ) into result;

  return result;
end;
$function$;

revoke all on function public.keep_battle_profile_battle_stats_daily(uuid,integer,text) from public;
grant execute on function public.keep_battle_profile_battle_stats_daily(uuid,integer,text) to authenticated;
