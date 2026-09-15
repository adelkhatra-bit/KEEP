-- Adel (04/09/2026) : "je puisse cliquer dessus et rajouter du Free pour
-- recréditer et ça enverra une notification à l'utilisateur ... par exemple
-- il y a eu un bug et je veux offrir un bonus pour le dérangement." Nouveau
-- ledger dédié (audit-friendly, comme keep_battle_credit_events) : un ajout
-- manuel Super Admin ne touche jamais aux compteurs de consommation
-- existants, juste un terme additif de plus dans la capacité calculée par
-- keep_theoretical_free_credit_remaining_for_profile -- ne peut donc jamais
-- casser un calcul déjà en place, seulement l'augmenter (ou, avec un montant
-- négatif, le corriger volontairement à la baisse).
create table if not exists public.admin_credit_grants (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  reason text not null default '',
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists admin_credit_grants_profile_idx on public.admin_credit_grants(profile_id);
alter table public.admin_credit_grants enable row level security;
drop policy if exists "admin_credit_grants_read_own" on public.admin_credit_grants;
create policy "admin_credit_grants_read_own" on public.admin_credit_grants for select using (auth.uid() = profile_id);

create or replace function public.keep_admin_credit_grant_total_for_profile(p_uid uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(sum(amount),0)::integer from public.admin_credit_grants where profile_id = p_uid;
$function$;

create or replace function public.keep_theoretical_free_credit_remaining_for_profile(p_uid uuid)
returns integer
language plpgsql
stable security definer
set search_path to 'public', 'auth'
as $function$
declare
  guest_limit integer:=3;
  signup_bonus integer:=20;
  growth_bonus integer:=0;
  battle_adjustment integer:=0;
  monthly_bonus integer:=0;
  admin_grant integer:=0;
  ledger_used integer:=0;
  derived_used integer:=0;
  used integer:=0;
  capacity integer:=0;
  locked_arena integer:=0;
begin
  if p_uid is null then return 0; end if;
  guest_limit:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='guest_success_limit' limit 1),3);
  signup_bonus:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='signup_bonus_successes' limit 1),20);
  growth_bonus:=public.keep_growth_free_credit_bonus_for_profile(p_uid);
  battle_adjustment:=public.keep_battle_credit_adjustment_for_profile(p_uid);
  monthly_bonus:=public.keep_monthly_free_bonus_for_profile(p_uid);
  admin_grant:=public.keep_admin_credit_grant_total_for_profile(p_uid);
  ledger_used:=coalesce((select consumed_count from public.download_credit_usage where profile_id=p_uid),0);
  derived_used:=public.keep_chargeable_keep_count(p_uid);
  used:=greatest(ledger_used,derived_used);
  capacity:=greatest(used,guest_limit+signup_bonus+growth_bonus+battle_adjustment+monthly_bonus+admin_grant);
  locked_arena:=coalesce((select sum(amount) from public.keep_battle_arena_credit_holds where profile_id=p_uid and status='LOCKED'),0);
  return greatest(0,capacity-used-locked_arena);
end;
$function$;
