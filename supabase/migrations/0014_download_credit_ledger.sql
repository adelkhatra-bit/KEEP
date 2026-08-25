create table if not exists public.download_credit_usage (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  consumed_count integer not null default 0 check (consumed_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.download_credit_usage enable row level security;

drop policy if exists download_credit_usage_select_own on public.download_credit_usage;
create policy download_credit_usage_select_own on public.download_credit_usage
for select to authenticated using (profile_id = auth.uid());

create or replace function public.keep_download_credit_status()
returns table(plan_code text, is_anonymous boolean, consumed integer, credit_limit integer, remaining integer, unlimited boolean)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  guest_limit integer := 3;
  signup_bonus integer := 4;
  used integer := 0;
  anon boolean := false;
  active_plan text := 'FREE';
begin
  if uid is null then raise exception 'authentication_required'; end if;

  select coalesce((value #>> '{}')::integer, 3) into guest_limit from public.remote_config where key='guest_success_limit';
  select coalesce((value #>> '{}')::integer, 4) into signup_bonus from public.remote_config where key='signup_bonus_successes';
  select coalesce(u.is_anonymous,false) into anon from auth.users u where u.id=uid;
  select coalesce(d.consumed_count,0) into used from public.download_credit_usage d where d.profile_id=uid;

  select coalesce(p.code::text,'FREE') into active_plan
  from public.subscriptions s
  join public.plans p on p.id=s.plan_id
  where s.profile_id=uid and s.status in ('ACTIVE','TRIALING')
  order by s.created_at desc limit 1;
  active_plan := coalesce(active_plan,'FREE');

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
returns table(allowed boolean, plan_code text, consumed integer, credit_limit integer, remaining integer, unlimited boolean)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  st record;
  new_used integer;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  select * into st from public.keep_download_credit_status();
  if not st.unlimited and st.remaining <= 0 then
    allowed := false; plan_code := st.plan_code; consumed := st.consumed; credit_limit := st.credit_limit; remaining := 0; unlimited := false; return next; return;
  end if;

  insert into public.download_credit_usage(profile_id, consumed_count, updated_at)
  values(uid,1,now())
  on conflict(profile_id) do update set consumed_count=public.download_credit_usage.consumed_count+1, updated_at=now()
  returning consumed_count into new_used;

  allowed := true;
  plan_code := st.plan_code;
  consumed := new_used;
  unlimited := st.unlimited;
  credit_limit := st.credit_limit;
  remaining := case when st.unlimited then null else greatest(0, st.credit_limit-new_used) end;
  return next;
end;
$$;

revoke all on function public.keep_download_credit_status() from public;
revoke all on function public.keep_consume_download_credit() from public;
grant execute on function public.keep_download_credit_status() to authenticated;
grant execute on function public.keep_consume_download_credit() to authenticated;
