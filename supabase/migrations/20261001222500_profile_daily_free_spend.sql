-- Daily FREE spending for music added to the profile.
-- The balance remains visible in the owner metrics bar; the expanded panel
-- shows what was actually spent during the current 02:00 -> 01:59 day.
create table if not exists public.keep_free_spend_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null check (amount > 0),
  reason text not null default 'KEEP_PROFILE',
  source_key text,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_keep_free_spend_events_source
  on public.keep_free_spend_events(profile_id,source_key)
  where source_key is not null;

create index if not exists idx_keep_free_spend_events_profile_time
  on public.keep_free_spend_events(profile_id,created_at desc);

alter table public.keep_free_spend_events enable row level security;
drop policy if exists keep_free_spend_events_owner_read on public.keep_free_spend_events;
create policy keep_free_spend_events_owner_read
  on public.keep_free_spend_events for select
  using (profile_id=(select auth.uid()));

create or replace function public.keep_log_download_credit_spend()
returns trigger
language plpgsql
security definer
set search_path=public
as $function$
declare
  delta integer;
begin
  if tg_op <> 'UPDATE' then return new; end if;
  delta := coalesce(new.consumed_count,0)-coalesce(old.consumed_count,0);
  if delta > 0 then
    insert into public.keep_free_spend_events(profile_id,amount,reason,created_at)
    values(new.profile_id,delta,'KEEP_PROFILE',coalesce(new.updated_at,now()));
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_keep_log_download_credit_spend on public.download_credit_usage;
create trigger trg_keep_log_download_credit_spend
after update of consumed_count on public.download_credit_usage
for each row
when (new.consumed_count > old.consumed_count)
execute function public.keep_log_download_credit_spend();

-- Backfill only the current logical day for direct paid KEEPs that happened
-- before this ledger existed. Social reprises are explicitly zero-credit.
with bounds as (
  select
    (date_trunc('day',(now() at time zone 'Europe/Paris')-interval '2 hours')+interval '2 hours') at time zone 'Europe/Paris' as starts_at,
    ((date_trunc('day',(now() at time zone 'Europe/Paris')-interval '2 hours')+interval '2 hours')+interval '1 day') at time zone 'Europe/Paris' as ends_at
),
cost as (
  select greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='free_cost_per_keep' limit 1),3)) as amount
)
insert into public.keep_free_spend_events(profile_id,amount,reason,source_key,created_at)
select kd.profile_id,cost.amount,'KEEP_PROFILE','decision:'||kd.id::text,kd.created_at
from public.keep_decisions kd
cross join bounds
cross join cost
where kd.decision='KEPT'
  and kd.created_at>=bounds.starts_at
  and kd.created_at<bounds.ends_at
  and kd.source_user_id is null
  and coalesce(kd.source_type,'') <> 'profile'
  and coalesce(kd.context->>'creditPolicy','LISTEN_KEEP')='LISTEN_KEEP'
on conflict(profile_id,source_key) where source_key is not null do nothing;

create or replace function public.keep_free_spent_today(p_timezone text default 'Europe/Paris')
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth
as $function$
declare
  uid uuid := auth.uid();
  v_tz text := coalesce(nullif(trim(p_timezone),''),'Europe/Paris');
  v_local_start timestamp without time zone;
  v_start timestamptz;
  v_end timestamptz;
  v_spent integer := 0;
  v_keeps integer := 0;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then v_tz:='Europe/Paris'; end if;

  v_local_start := date_trunc('day',(now() at time zone v_tz)-interval '2 hours')+interval '2 hours';
  v_start := v_local_start at time zone v_tz;
  v_end := (v_local_start+interval '1 day') at time zone v_tz;

  select coalesce(sum(e.amount),0)::integer
    into v_spent
  from public.keep_free_spend_events e
  where e.profile_id=uid and e.created_at>=v_start and e.created_at<v_end;

  select count(*)::integer
    into v_keeps
  from public.keep_decisions kd
  where kd.profile_id=uid
    and kd.decision='KEPT'
    and kd.created_at>=v_start and kd.created_at<v_end
    and kd.source_user_id is null
    and coalesce(kd.source_type,'') <> 'profile'
    and coalesce(kd.context->>'creditPolicy','LISTEN_KEEP')='LISTEN_KEEP';

  return jsonb_build_object(
    'spent',v_spent,
    'keeps',v_keeps,
    'period','TODAY_2AM',
    'timezone',v_tz,
    'startedAt',v_start,
    'endsAt',v_end
  );
end;
$function$;

revoke all on function public.keep_free_spent_today(text) from public,anon;
grant execute on function public.keep_free_spent_today(text) to authenticated;
