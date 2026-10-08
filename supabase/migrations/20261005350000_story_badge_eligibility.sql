-- Débloquer son badge (Adel 05/10/2026, IDEA-104) : offert 30 jours après l'inscription (ou après le 05/10/2026 pour les comptes existants, afin de ne léser personne) ; ensuite il faut au moins 1 parrainage validé OU une formule payante active.
-- Lecture seule (aucune donnée modifiée) ; le classement public n'affiche plus que les profils éligibles.
create or replace function public.keep_story_badge_eligible(p_profile_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists (select 1 from public.profiles p where p.id = p_profile_id and greatest(p.created_at, timestamptz '2026-10-05 00:00:00+00') > now() - interval '30 days')
      or exists (select 1 from public.keep_referrals r where r.referrer_profile_id = p_profile_id and r.qualified_at is not null)
      or exists (select 1 from public.subscriptions s join public.plans pl on pl.id = s.plan_id where s.profile_id = p_profile_id and s.status = 'ACTIVE' and pl.code <> 'FREE' and (s.current_period_end is null or s.current_period_end > now()));
$function$;
revoke all on function public.keep_story_badge_eligible(uuid) from public, anon;
grant execute on function public.keep_story_badge_eligible(uuid) to authenticated;

create or replace function public.keep_story_ranking()
returns table(profile_id uuid, score integer, rank integer)
language sql stable security definer set search_path to 'public' as $function$
  with events as (
    select sp.profile_id as pid, 1 as pts from public.story_pins sp where sp.masked = false and sp.pinned_at > now() - interval '7 days'
    union all
    select d.source_user_id, 3 from public.keep_decisions d where d.decision = 'KEPT' and d.source_user_id is not null and d.source_user_id <> d.profile_id and d.created_at > now() - interval '7 days'
    union all
    select f.followee_id, 2 from public.follows f where f.follower_id <> f.followee_id and f.created_at > now() - interval '7 days'
  ), scored as (
    select e.pid, sum(e.pts)::integer as score from events e
    join public.profiles p on p.id = e.pid and p.is_public = true and coalesce(p.discovery_hidden, false) = false
    where public.keep_story_badge_eligible(e.pid)
    group by e.pid
  )
  select s.pid, s.score, (row_number() over (order by s.score desc, s.pid))::integer as rank
  from scored s order by s.score desc, s.pid limit 50;
$function$;

create or replace function public.keep_my_story_stats_v2()
returns table(shares integer, reprises integer, followers integer, score integer, rank integer, eligible boolean, grace_days_left integer, referrals_qualified integer, premium boolean)
language sql stable security definer set search_path to 'public' as $function$
  with events as (
    select sp.profile_id as pid, 1 as pts from public.story_pins sp where sp.masked = false and sp.pinned_at > now() - interval '7 days'
    union all
    select d.source_user_id, 3 from public.keep_decisions d where d.decision = 'KEPT' and d.source_user_id is not null and d.source_user_id <> d.profile_id and d.created_at > now() - interval '7 days'
    union all
    select f.followee_id, 2 from public.follows f where f.follower_id <> f.followee_id and f.created_at > now() - interval '7 days'
  ), scored as (
    select e.pid, sum(e.pts)::integer as score from events e
    join public.profiles p on p.id = e.pid and p.is_public = true and coalesce(p.discovery_hidden, false) = false
    where public.keep_story_badge_eligible(e.pid)
    group by e.pid
  ), ranked as (
    select s.pid, (row_number() over (order by s.score desc, s.pid))::integer as rank from scored s
  ), mine as (
    select
      coalesce((select count(*) from public.story_pins sp where sp.profile_id = auth.uid() and sp.masked = false and sp.pinned_at > now() - interval '7 days'), 0)::integer as shares,
      coalesce((select count(*) from public.keep_decisions d where d.source_user_id = auth.uid() and d.profile_id <> auth.uid() and d.decision = 'KEPT' and d.created_at > now() - interval '7 days'), 0)::integer as reprises,
      coalesce((select count(*) from public.follows f where f.followee_id = auth.uid() and f.follower_id <> auth.uid() and f.created_at > now() - interval '7 days'), 0)::integer as followers
  )
  select m.shares, m.reprises, m.followers, (m.shares + 3 * m.reprises + 2 * m.followers)::integer as score, r.rank,
    public.keep_story_badge_eligible(auth.uid()) as eligible,
    greatest(0, ceil(extract(epoch from (greatest((select p.created_at from public.profiles p where p.id = auth.uid()), timestamptz '2026-10-05 00:00:00+00') + interval '30 days' - now())) / 86400.0))::integer as grace_days_left,
    (select count(*) from public.keep_referrals r2 where r2.referrer_profile_id = auth.uid() and r2.qualified_at is not null)::integer as referrals_qualified,
    exists (select 1 from public.subscriptions s join public.plans pl on pl.id = s.plan_id where s.profile_id = auth.uid() and s.status = 'ACTIVE' and pl.code <> 'FREE' and (s.current_period_end is null or s.current_period_end > now())) as premium
  from mine m left join ranked r on r.pid = auth.uid();
$function$;
revoke all on function public.keep_my_story_stats_v2() from public, anon;
grant execute on function public.keep_my_story_stats_v2() to authenticated;
