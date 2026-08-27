-- KEEP credit accounting must use one authoritative ledger for every account.
-- Historical authenticated usage was previously inferred from playlist_tracks while
-- keep_consume_download_credit only incremented anonymous users. Backfill the ledger
-- first so existing users keep exactly the consumption they already had.
with historical_usage as (
  select p.owner_id as profile_id,
         count(distinct pt.track_id)::integer as consumed_count
  from public.playlists p
  join public.playlist_tracks pt on pt.playlist_id = p.id
  where coalesce(pt.added_via, 'KEEP') = 'KEEP'
  group by p.owner_id
)
insert into public.download_credit_usage(profile_id, consumed_count, updated_at)
select profile_id, consumed_count, now()
from historical_usage
on conflict(profile_id) do update
set consumed_count = greatest(public.download_credit_usage.consumed_count, excluded.consumed_count),
    updated_at = now();

create or replace function public.keep_download_credit_status()
returns table(
  plan_code text,
  is_anonymous boolean,
  consumed integer,
  credit_limit integer,
  remaining integer,
  unlimited boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  guest_limit integer := 3;
  signup_bonus integer := 20;
  used integer := 0;
  anon boolean := false;
  active_plan text := 'FREE';
begin
  if uid is null then raise exception 'authentication_required'; end if;

  guest_limit := coalesce((
    select (rc.value #>> '{}')::integer
    from public.remote_config rc
    where rc.key = 'guest_success_limit'
    limit 1
  ), 3);

  signup_bonus := coalesce((
    select (rc.value #>> '{}')::integer
    from public.remote_config rc
    where rc.key = 'signup_bonus_successes'
    limit 1
  ), 20);

  anon := coalesce((select u.is_anonymous from auth.users u where u.id = uid), false);
  used := coalesce((select d.consumed_count from public.download_credit_usage d where d.profile_id = uid), 0);

  active_plan := coalesce((
    select p.code::text
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.profile_id = uid
      and s.status in ('ACTIVE','TRIALING')
      and (s.current_period_end is null or s.current_period_end > now())
    order by s.current_period_start desc nulls last, s.created_at desc
    limit 1
  ), 'FREE');

  plan_code := active_plan;
  is_anonymous := anon;
  consumed := used;
  unlimited := active_plan <> 'FREE';
  credit_limit := case when unlimited then null when anon then guest_limit else guest_limit + signup_bonus end;
  remaining := case when unlimited then null else greatest(0, credit_limit - used) end;
  return next;
end;
$$;

create or replace function public.keep_consume_download_credit()
returns table(
  allowed boolean,
  plan_code text,
  consumed integer,
  credit_limit integer,
  remaining integer,
  unlimited boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  st record;
  used integer := 0;
begin
  if uid is null then raise exception 'authentication_required'; end if;

  -- One row per profile is the serialization point. FOR UPDATE prevents two
  -- simultaneous KEEP actions from both consuming the same last free credit.
  insert into public.download_credit_usage(profile_id, consumed_count, updated_at)
  values(uid, 0, now())
  on conflict(profile_id) do nothing;

  select d.consumed_count
    into used
  from public.download_credit_usage d
  where d.profile_id = uid
  for update;

  select * into st from public.keep_download_credit_status();

  if st.unlimited then
    allowed := true;
    plan_code := st.plan_code;
    consumed := used;
    credit_limit := null;
    remaining := null;
    unlimited := true;
    return next;
    return;
  end if;

  if used >= coalesce(st.credit_limit, 0) then
    allowed := false;
    plan_code := st.plan_code;
    consumed := used;
    credit_limit := st.credit_limit;
    remaining := 0;
    unlimited := false;
    return next;
    return;
  end if;

  used := used + 1;
  update public.download_credit_usage
     set consumed_count = used,
         updated_at = now()
   where profile_id = uid;

  allowed := true;
  plan_code := st.plan_code;
  consumed := used;
  credit_limit := st.credit_limit;
  remaining := greatest(0, st.credit_limit - used);
  unlimited := false;
  return next;
end;
$$;

create or replace function public.keep_import_guest_credit_usage(p_guest_consumed integer)
returns table(
  plan_code text,
  is_anonymous boolean,
  consumed integer,
  credit_limit integer,
  remaining integer,
  unlimited boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  guest_limit integer := 3;
  imported integer := 0;
begin
  if uid is null then raise exception 'authentication_required'; end if;

  guest_limit := coalesce((
    select (rc.value #>> '{}')::integer
    from public.remote_config rc
    where rc.key = 'guest_success_limit'
    limit 1
  ), 3);

  imported := least(greatest(coalesce(p_guest_consumed, 0), 0), guest_limit);

  insert into public.download_credit_usage(profile_id, consumed_count, updated_at)
  values(uid, imported, now())
  on conflict(profile_id) do update
    set consumed_count = greatest(public.download_credit_usage.consumed_count, excluded.consumed_count),
        updated_at = now();

  return query select * from public.keep_download_credit_status();
end;
$$;

revoke all on function public.keep_download_credit_status() from public;
revoke all on function public.keep_consume_download_credit() from public;
revoke all on function public.keep_import_guest_credit_usage(integer) from public;
grant execute on function public.keep_download_credit_status() to authenticated;
grant execute on function public.keep_consume_download_credit() to authenticated;
grant execute on function public.keep_import_guest_credit_usage(integer) to authenticated;
