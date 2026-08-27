-- KEEP — source unique des compteurs publics + certification de profil.
-- Cette migration s'applique à tous les comptes présents et futurs.
-- Aucune donnée Auth sensible n'est exposée au profil public.

create or replace function public.keep_public_profile_snapshot(p_profile_id uuid)
returns table(
  direct_public_keeps integer,
  social_public_keeps integer,
  total_public_keeps integer,
  followers integer,
  following integer,
  account_verified boolean,
  plan_code text,
  certification_tier text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
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
  with public_keeps as (
    select
      kd.track_id,
      coalesce(
        kd.context->>'creditPolicy' = 'SOCIAL_ZERO_CREDIT'
        or kd.source_user_id is not null
        or kd.source_type = 'profile'
        or nullif(kd.context->>'sourceProfileId', '') is not null,
        false
      ) as is_social
    from public.keep_decisions kd
    where kd.profile_id = p_profile_id
      and kd.decision = 'KEPT'
      and kd.visibility = 'PUBLIC'
  )
  select
    count(distinct pk.track_id) filter (where not pk.is_social)::integer,
    count(distinct pk.track_id) filter (where pk.is_social)::integer,
    count(distinct pk.track_id)::integer,
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
  from public_keeps pk;
end;
$$;

revoke all on function public.keep_public_profile_snapshot(uuid) from public;
grant execute on function public.keep_public_profile_snapshot(uuid) to anon, authenticated;

-- Le Super Admin reçoit exactement le même niveau de certification que le mobile.
drop function if exists public.admin_user_directory();
create function public.admin_user_directory()
returns table(
  id uuid,
  email text,
  email_confirmed_at timestamptz,
  username text,
  display_name text,
  support_number bigint,
  country_code char(2),
  kind text,
  created_at timestamptz,
  plan_code text,
  keeps_this_month bigint,
  avatar_url text,
  free_keeps_used integer,
  social_keeps integer,
  credit_consumed integer,
  credit_limit integer,
  credit_remaining integer,
  playlist_tracks integer,
  recognized_count integer,
  account_verified boolean,
  certification_tier text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  guest_limit integer := 3;
  signup_bonus integer := 20;
begin
  if not exists (
    select 1 from public.admin_users a
    where a.id = auth.uid() and a.is_active = true
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  guest_limit := coalesce((select (value #>> '{}')::integer from public.remote_config where key='guest_success_limit' limit 1), 3);
  signup_bonus := coalesce((select (value #>> '{}')::integer from public.remote_config where key='signup_bonus_successes' limit 1), 20);

  return query
  select
    p.id,
    case when u.email like '%@keep.local' then null else u.email::text end,
    case when u.email like '%@keep.local' then null else u.email_confirmed_at end,
    p.username::text,
    p.display_name::text,
    p.support_number,
    p.country_code,
    p.kind::text,
    p.created_at,
    coalesce(active_plan.code, 'FREE')::text,
    coalesce(monthly.keeps, 0)::bigint,
    p.avatar_url::text,
    public.keep_chargeable_keep_count(p.id),
    public.keep_social_keep_count(p.id),
    greatest(coalesce(d.consumed_count, 0), public.keep_chargeable_keep_count(p.id)),
    case when coalesce(active_plan.code, 'FREE')::text = 'FREE' then guest_limit + signup_bonus else null end,
    case when coalesce(active_plan.code, 'FREE')::text = 'FREE'
      then greatest(0, guest_limit + signup_bonus - greatest(coalesce(d.consumed_count, 0), public.keep_chargeable_keep_count(p.id)))
      else null end,
    coalesce(library.track_count, 0),
    coalesce(mu.recognized_count, 0),
    coalesce(not u.is_anonymous, false),
    case
      when not coalesce(not u.is_anonymous, false) then 'UNVERIFIED'
      when coalesce(active_plan.code, 'FREE') = 'VENUE_PRO' then 'VENUE_PRO'
      when coalesce(active_plan.code, 'FREE') = 'CREATOR_PRO' then 'CREATOR_PRO'
      when coalesce(active_plan.code, 'FREE') = 'PREMIUM' then 'PREMIUM'
      else 'FREE'
    end::text
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join lateral (
    select pl.code::text as code
    from public.subscriptions s
    join public.plans pl on pl.id = s.plan_id
    where s.profile_id = p.id
      and s.status in ('ACTIVE','TRIALING')
      and (s.current_period_end is null or s.current_period_end > now())
    order by s.current_period_start desc nulls last, s.created_at desc
    limit 1
  ) active_plan on true
  left join lateral (
    select count(*)::bigint as keeps
    from public.keep_decisions kd
    where kd.profile_id = p.id
      and kd.decision = 'KEPT'
      and kd.created_at >= date_trunc('month', now())
  ) monthly on true
  left join public.download_credit_usage d on d.profile_id = p.id
  left join public.music_usage_counters mu on mu.profile_id = p.id
  left join lateral (
    select count(distinct pt.track_id)::integer as track_count
    from public.playlists pl
    join public.playlist_tracks pt on pt.playlist_id = pl.id
    where pl.owner_id = p.id
  ) library on true
  order by p.created_at desc;
end;
$$;

revoke all on function public.admin_user_directory() from public;
grant execute on function public.admin_user_directory() to authenticated;
