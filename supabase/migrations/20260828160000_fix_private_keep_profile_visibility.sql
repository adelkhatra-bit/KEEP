-- KEEP — correction confidentialité Public / Privé.
--
-- Une piste peut avoir plusieurs décisions historiques. La visibilité du profil
-- doit TOUJOURS être celle de la décision KEEP la plus récente. Les anciennes
-- versions filtraient PUBLIC avant de choisir la dernière décision : une vieille
-- ligne PUBLIC pouvait donc rester visible même après passage récent en PRIVÉ.

create or replace function public.keep_public_profile_tracks(
  p_profile_id uuid,
  p_limit integer default 250,
  p_offset integer default 0
)
returns table(
  decision_id uuid,
  kept_at timestamptz,
  track_id uuid,
  isrc text,
  title text,
  artist text,
  album text,
  duration_sec integer,
  artwork_url text,
  genres text[],
  provider_ids jsonb,
  preview_url text,
  external_urls jsonb,
  available_on text[],
  context jsonb,
  source_user_id uuid,
  source_type text
)
language sql
stable
security definer
set search_path = public
as $$
  with latest as (
    select distinct on (kd.track_id)
      kd.id as decision_id,
      kd.created_at as kept_at,
      kd.visibility::text as visibility,
      kd.track_id,
      t.isrc,
      t.title,
      t.artist,
      t.album,
      t.duration_sec,
      t.artwork_url,
      t.genres,
      t.provider_ids,
      t.preview_url,
      t.external_urls,
      t.available_on,
      kd.context,
      kd.source_user_id,
      kd.source_type::text as source_type
    from public.keep_decisions kd
    join public.profiles p on p.id = kd.profile_id
    join public.tracks t on t.id = kd.track_id
    where kd.profile_id = p_profile_id
      and p.is_public = true
      and kd.decision = 'KEPT'
    order by kd.track_id, kd.created_at desc, kd.id desc
  )
  select
    decision_id,
    kept_at,
    track_id,
    isrc,
    title,
    artist,
    album,
    duration_sec,
    artwork_url,
    genres,
    provider_ids,
    preview_url,
    external_urls,
    available_on,
    context,
    source_user_id,
    source_type
  from latest
  where visibility = 'PUBLIC'
  order by kept_at desc, decision_id desc
  limit least(greatest(coalesce(p_limit, 250), 1), 500)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.keep_public_profile_tracks(uuid, integer, integer) from public;
grant execute on function public.keep_public_profile_tracks(uuid, integer, integer) to anon, authenticated;

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
    where kd.profile_id = p_profile_id
      and kd.decision = 'KEPT'
    order by kd.track_id, kd.created_at desc, kd.id desc
  ), public_keeps as (
    select track_id, is_social
    from latest
    where visibility = 'PUBLIC'
  )
  select
    count(*) filter (where not pk.is_social)::integer,
    count(*) filter (where pk.is_social)::integer,
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
  from public_keeps pk;
end;
$$;

revoke all on function public.keep_public_profile_snapshot(uuid) from public;
grant execute on function public.keep_public_profile_snapshot(uuid) to anon, authenticated;
