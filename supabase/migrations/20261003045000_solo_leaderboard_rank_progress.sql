-- Classement SOLO dédié : le classement n'est plus une projection des Battles en ligne.
-- Le rang progresse avec les bonnes réponses Solo, puis l'exactitude, les abandons
-- et le volume total servent de départage. Une amélioration crée une notification.

create or replace function public.keep_battle_solo_rank_for(p_uid uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with completed as (
    select h.profile_id, count(*)::int as games
    from public.keep_battle_solo_history h
    group by h.profile_id
  ),
  abandoned as (
    select
      u.profile_id,
      greatest(0, coalesce(sum(u.starts), 0)::int - coalesce(c.games, 0))::int as abandons
    from public.keep_battle_solo_daily_usage u
    left join completed c on c.profile_id = u.profile_id
    group by u.profile_id, c.games
  ),
  ranked as (
    select
      s.profile_id,
      row_number() over (
        order by
          s.solo_correct desc,
          (s.solo_correct::numeric / greatest(1, s.solo_total)) desc,
          coalesce(a.abandons, 0) asc,
          s.solo_total desc,
          s.profile_id
      )::int as rank
    from public.keep_battle_skill_stats s
    join public.profiles p on p.id = s.profile_id
    left join abandoned a on a.profile_id = s.profile_id
    where coalesce(s.solo_total, 0) > 0
      and coalesce(p.is_public, true) = true
  )
  select r.rank
  from ranked r
  where r.profile_id = p_uid;
$$;

revoke all on function public.keep_battle_solo_rank_for(uuid) from public, anon, authenticated;
grant execute on function public.keep_battle_solo_rank_for(uuid) to service_role;

create or replace function public.keep_battle_solo_leaderboard(p_limit integer default 20)
returns table(
  profile_id uuid,
  username text,
  avatar_url text,
  wins integer,
  matches_played integer,
  total_score integer,
  total_correct integer,
  avg_response_ms integer,
  top_theme_code text,
  skill_tier text,
  is_online boolean,
  presence_theme_code text,
  abandons integer
)
language sql
stable
security definer
set search_path = public
as $$
  with history_stats as (
    select
      h.profile_id,
      count(*)::int as games,
      count(*) filter (where h.correct_answers = h.round_count)::int as perfects
    from public.keep_battle_solo_history h
    group by h.profile_id
  ),
  theme_stats as (
    select
      h.profile_id,
      h.theme_code,
      sum(h.correct_answers)::int as correct,
      count(*)::int as games
    from public.keep_battle_solo_history h
    group by h.profile_id, h.theme_code
  ),
  best_theme as (
    select distinct on (profile_id)
      profile_id,
      theme_code
    from theme_stats
    order by profile_id, correct desc, games desc, theme_code
  ),
  abandoned as (
    select
      u.profile_id,
      greatest(0, coalesce(sum(u.starts), 0)::int - coalesce(hs.games, 0))::int as abandons
    from public.keep_battle_solo_daily_usage u
    left join history_stats hs on hs.profile_id = u.profile_id
    group by u.profile_id, hs.games
  ),
  online as (
    select sp.profile_id, sp.theme_code
    from public.keep_battle_solo_presence sp
    where (sp.status = 'AVAILABLE' and sp.last_seen_at > now() - interval '20 seconds')
       or (sp.manual_available = true and sp.last_seen_at > now() - interval '30 minutes')
  )
  select
    p.id as profile_id,
    p.username,
    p.avatar_url,
    coalesce(hs.perfects, 0)::int as wins,
    coalesce(hs.games, 0)::int as matches_played,
    s.solo_correct::int as total_score,
    s.solo_correct::int as total_correct,
    null::integer as avg_response_ms,
    bt.theme_code as top_theme_code,
    public.keep_battle_skill_tier(p.id) as skill_tier,
    (o.profile_id is not null) as is_online,
    o.theme_code as presence_theme_code,
    coalesce(a.abandons, 0)::int as abandons
  from public.keep_battle_skill_stats s
  join public.profiles p on p.id = s.profile_id
  left join history_stats hs on hs.profile_id = s.profile_id
  left join best_theme bt on bt.profile_id = s.profile_id
  left join abandoned a on a.profile_id = s.profile_id
  left join online o on o.profile_id = s.profile_id
  where coalesce(s.solo_total, 0) > 0
    and coalesce(p.is_public, true) = true
  order by
    s.solo_correct desc,
    (s.solo_correct::numeric / greatest(1, s.solo_total)) desc,
    coalesce(a.abandons, 0) asc,
    s.solo_total desc,
    p.id
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

revoke all on function public.keep_battle_solo_leaderboard(integer) from public, anon;
grant execute on function public.keep_battle_solo_leaderboard(integer) to authenticated;

create or replace function public.keep_battle_my_solo_rank()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  v_rank integer;
  v_total integer;
  v_correct integer := 0;
  v_answers integer := 0;
  v_matches integer := 0;
  v_perfects integer := 0;
  v_abandons integer := 0;
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  v_rank := public.keep_battle_solo_rank_for(uid);

  select count(*)::int into v_total
  from public.keep_battle_skill_stats s
  join public.profiles p on p.id = s.profile_id
  where coalesce(s.solo_total, 0) > 0
    and coalesce(p.is_public, true) = true;

  select coalesce(s.solo_correct, 0), coalesce(s.solo_total, 0)
    into v_correct, v_answers
  from public.keep_battle_skill_stats s
  where s.profile_id = uid;

  select
    count(*)::int,
    count(*) filter (where h.correct_answers = h.round_count)::int
    into v_matches, v_perfects
  from public.keep_battle_solo_history h
  where h.profile_id = uid;

  select greatest(0, coalesce(sum(u.starts), 0)::int - v_matches)
    into v_abandons
  from public.keep_battle_solo_daily_usage u
  where u.profile_id = uid;

  return jsonb_build_object(
    'rank', v_rank,
    'totalPlayers', coalesce(v_total, 0),
    'correct', coalesce(v_correct, 0),
    'totalAnswers', coalesce(v_answers, 0),
    'accuracy', case when coalesce(v_answers, 0) > 0 then round((v_correct::numeric / v_answers) * 100, 1) else 0 end,
    'matches', coalesce(v_matches, 0),
    'perfects', coalesce(v_perfects, 0),
    'abandons', coalesce(v_abandons, 0)
  );
end;
$$;

revoke all on function public.keep_battle_my_solo_rank() from public, anon;
grant execute on function public.keep_battle_my_solo_rank() to authenticated;

create or replace function public.keep_battle_solo_report_result(p_correct integer, p_total integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  total integer;
  correct integer;
  free_earned integer;
  max_reward integer;
  matched_history_id uuid;
  old_rank integer;
  new_rank integer;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_total is null or p_total <= 0 then return; end if;

  total := least(p_total, 30);
  correct := least(greatest(0, coalesce(p_correct, 0)), total);
  old_rank := public.keep_battle_solo_rank_for(uid);

  insert into public.keep_battle_skill_stats(profile_id, solo_correct, solo_total, updated_at)
  values (uid, correct, total, now())
  on conflict (profile_id) do update set
    solo_correct = keep_battle_skill_stats.solo_correct + correct,
    solo_total = keep_battle_skill_stats.solo_total + total,
    updated_at = now();

  max_reward := public.keep_battle_solo_max_reward_for_round_count(total);
  free_earned := case when correct = total then max_reward else 0 end;

  select h.id into matched_history_id
  from public.keep_battle_solo_history h
  where h.profile_id = uid
    and h.completed_at >= now() - interval '5 minutes'
  order by h.completed_at desc
  limit 1;

  if matched_history_id is not null and free_earned > 0 then
    insert into public.keep_battle_solo_credit_events(history_id, profile_id, result, amount)
    values (matched_history_id, uid, 'WIN', free_earned)
    on conflict (history_id, profile_id) do nothing;
  end if;

  new_rank := public.keep_battle_solo_rank_for(uid);
  if new_rank is not null and (old_rank is null or new_rank < old_rank) then
    insert into public.notifications(profile_id, type, title, body, data, push_delivery_status, push_attempt_count)
    values (
      uid,
      'SOLO_RANK_UP',
      '🏆 Classement Solo · #' || new_rank,
      case
        when old_rank is null then 'Tu entres dans le classement Solo à la place #' || new_rank || '.'
        else 'Tu progresses dans le classement Solo : #' || old_rank || ' → #' || new_rank || '.'
      end,
      jsonb_build_object(
        'event', 'SOLO_RANK_UP',
        'oldRank', old_rank,
        'newRank', new_rank,
        'correct', correct,
        'total', total,
        'soundKind', 'battle'
      ),
      'CREATED',
      0
    );
  end if;
end;
$$;

revoke all on function public.keep_battle_solo_report_result(integer, integer) from public, anon;
grant execute on function public.keep_battle_solo_report_result(integer, integer) to authenticated;
