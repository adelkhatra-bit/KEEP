create or replace function public.keep_event_creation_status()
returns table(plan_code text, allowed boolean, used integer, limit_value integer, remaining integer, unlimited boolean)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  plan text;
  lim integer;
  cnt integer;
  follower_count integer := 0;
  min_followers integer := 500;
  month_start timestamptz := date_trunc('month', now());
begin
  if uid is null then raise exception 'authentication_required'; end if;
  plan := public.keep_active_plan_code(uid);
  lim := public.keep_plan_limit(plan, 'events_per_month');

  select count(*)::integer into cnt
  from public.events
  where creator_id = uid and created_at >= month_start;

  select count(*)::integer into follower_count
  from public.follows
  where followee_id = uid;

  select coalesce((value #>> '{}')::integer, 500)
    into min_followers
  from public.remote_config
  where key = 'growth_followers_tier4_threshold';
  min_followers := coalesce(min_followers, 500);

  plan_code := plan;
  used := cnt;
  limit_value := lim;
  unlimited := lim is null and plan = 'VENUE_PRO';
  allowed := follower_count >= min_followers and (unlimited or cnt < coalesce(lim, 0));
  remaining := case when unlimited then null else greatest(coalesce(lim, 0) - cnt, 0) end;
  return next;
end;
$function$;
