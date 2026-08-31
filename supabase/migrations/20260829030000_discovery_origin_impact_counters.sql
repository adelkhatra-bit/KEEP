create or replace function public.keep_own_profile_snapshot()
returns table(direct_keeps integer, social_keeps integer, total_keeps integer, public_keeps integer, private_keeps integer)
language sql
stable
security definer
set search_path to 'public','auth'
as $function$
  with latest as (
    select distinct on (kd.track_id)
      kd.track_id,
      kd.visibility::text as visibility,
      coalesce(
        kd.context->>'creditPolicy' = 'SOCIAL_ZERO_CREDIT'
        or kd.source_user_id is not null
        or kd.source_type = 'profile'
        or nullif(kd.context->>'sourceProfileId', '') is not null,
        false
      ) as is_social
    from public.keep_decisions kd
    where kd.profile_id = auth.uid()
      and kd.decision = 'KEPT'
    order by kd.track_id, kd.created_at desc, kd.id desc
  ), impact as (
    select count(*)::integer as recovery_count
    from public.keep_decisions kd
    where kd.decision = 'KEPT'
      and kd.source_user_id = auth.uid()
      and kd.profile_id <> auth.uid()
  )
  select
    count(*) filter (where not l.is_social)::integer,
    coalesce((select recovery_count from impact), 0)::integer,
    count(*)::integer,
    count(*) filter (where l.visibility = 'PUBLIC')::integer,
    count(*) filter (where l.visibility = 'PRIVATE')::integer
  from latest l;
$function$;

create or replace function public.keep_public_profile_snapshot(p_profile_id uuid)
returns table(direct_public_keeps integer, social_public_keeps integer, total_public_keeps integer, followers integer, following integer, account_verified boolean, plan_code text, certification_tier text)
language plpgsql
stable
security definer
set search_path to 'public','auth'
as $function$
declare
  v_verified boolean := false;
  v_plan text := 'FREE';
begin
  if p_profile_id is null or not exists (
    select 1 from public.profiles p where p.id = p_profile_id and p.is_public = true
  ) then
    return;
  end if;

  select coalesce(not u.is_anonymous, false)
    into v_verified
  from auth.users u
  where u.id = p_profile_id;
  v_verified := coalesce(v_verified, false);

  select coalesce((
    select pl.code::text
    from public.subscriptions s
    join public.plans pl on pl.id = s.plan_id
    where s.profile_id = p_profile_id
      and s.status in ('ACTIVE','TRIALING')
      and (s.current_period_end is null or s.current_period_end > now())
    order by s.current_period_start desc nulls last, s.created_at desc
    limit 1
  ), 'FREE') into v_plan;

  return query
  with latest as (
    select distinct on (kd.track_id)
      kd.track_id,
      kd.visibility::text as visibility
    from public.keep_decisions kd
    where kd.profile_id = p_profile_id
      and kd.decision = 'KEPT'
    order by kd.track_id, kd.created_at desc, kd.id desc
  ), public_keeps as (
    select track_id
    from latest
    where visibility = 'PUBLIC'
  ), impact as (
    select count(*)::integer as recovery_count
    from public.keep_decisions kd
    where kd.decision = 'KEPT'
      and kd.source_user_id = p_profile_id
      and kd.profile_id <> p_profile_id
  )
  select
    count(*)::integer,
    coalesce((select recovery_count from impact), 0)::integer,
    count(*)::integer,
    (select count(*)::integer from public.follows f where f.followee_id = p_profile_id),
    (select count(*)::integer from public.follows f where f.follower_id = p_profile_id),
    v_verified,
    v_plan,
    case
      when not v_verified then 'UNVERIFIED'
      when v_plan = 'VENUE_PRO' then 'VENUE_PRO'
      when v_plan = 'CREATOR_PRO' then 'CREATOR_PRO'
      when v_plan = 'PREMIUM' then 'PREMIUM'
      else 'FREE'
    end::text
  from public_keeps;
end;
$function$;

comment on function public.keep_own_profile_snapshot() is 'KEEP profile counters: total/visibility for owner plus social_keeps = downstream KEEP recoveries credited to this discoverer.';
comment on function public.keep_public_profile_snapshot(uuid) is 'Public KEEP profile counters: KEEP = public library size; KEEP utilisateurs = downstream KEEP recoveries credited to this discoverer.';
