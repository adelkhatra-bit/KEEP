-- Schéma canonique du grand livre mensuel Free.
-- Production possède déjà cette table ; CREATE IF NOT EXISTS est donc un no-op.
-- Le garde-fou rend le replay complet sur PostgreSQL vierge déterministe.

create table if not exists public.monthly_free_credit_awards (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  credit_month date not null,
  amount integer not null check (amount >= 0),
  plan_code text not null,
  reason text not null check (reason in ('OPENING','MONTH_END','ACTIVATION')),
  created_at timestamptz not null default now(),
  primary key (profile_id, credit_month),
  constraint monthly_free_credit_awards_credit_month_check
    check (credit_month = date_trunc('month', credit_month::timestamptz)::date)
);

alter table public.monthly_free_credit_awards enable row level security;

revoke all on public.monthly_free_credit_awards from public, anon, authenticated;
grant select on public.monthly_free_credit_awards to authenticated;
grant all on public.monthly_free_credit_awards to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname='public'
      and tablename='monthly_free_credit_awards'
      and policyname='monthly_free_awards_self_read'
  ) then
    create policy monthly_free_awards_self_read
      on public.monthly_free_credit_awards
      for select
      to authenticated
      using (profile_id = (select auth.uid()));
  end if;
end
$$;
