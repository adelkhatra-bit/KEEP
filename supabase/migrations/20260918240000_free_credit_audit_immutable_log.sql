-- AUDIT SYSTEM CRITIQUE (18/09/2026) : Système d'audit immuable des Free
-- Cette table est APPEND-ONLY (jamais de DELETE/UPDATE)
-- Elle trace CHAQUE calcul de solde Free pour détection de bugs à grande échelle
--
-- Problème évité: Une migration cassée peut affecter des millions d'utilisateurs
-- avant qu'on s'en aperçoive. Cette audit permet de tracer et récupérer.

-- Table d'audit immutable: chaque calcul de Free est enregistré
create table if not exists public.free_credit_audit_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('BALANCE_CALCULATED', 'BALANCE_EXPECTED', 'AUDIT_DISCREPANCY', 'AUDIT_RECOVERY')),

  -- État du calcul à ce moment précis
  remaining_free integer not null,
  guest_limit integer,
  signup_bonus integer,
  follower_bonus integer,
  referral_bonus integer,
  monthly_bonus integer,
  admin_grant integer,
  battle_adjustment integer,
  used integer,
  locked_arena integer,

  -- Source de calcul (pour tracer d'où vient chaque nombre)
  calculation_method text not null check (calculation_method in ('DIRECT_QUERY', 'BREAKDOWN_RPC', 'THEORETICAL_CALC', 'ADMIN_CORRECTION')),

  -- Pour audits futurs: ce qui était attendu vs ce qu'on a eu
  expected_remaining integer,
  discrepancy integer,
  discrepancy_reason text,

  -- Métadonnées
  client_version text,
  created_at timestamptz not null default now(),

  -- Index pour audit rapide
  constraint unique_profile_timestamp unique (profile_id, created_at)
);

create index if not exists idx_free_audit_profile_date on public.free_credit_audit_log(profile_id, created_at desc);
create index if not exists idx_free_audit_event_type on public.free_credit_audit_log(event_type, created_at desc);
create index if not exists idx_free_audit_discrepancy on public.free_credit_audit_log(discrepancy_reason) where discrepancy_reason is not null;

alter table public.free_credit_audit_log enable row level security;
revoke all on public.free_credit_audit_log from anon, authenticated;

-- Fonction helper: enregistrer chaque calcul de Free
create or replace function public.free_credit_log_balance_calculated(
  p_profile_id uuid,
  p_remaining_free integer,
  p_guest_limit integer DEFAULT null,
  p_signup_bonus integer DEFAULT null,
  p_follower_bonus integer DEFAULT null,
  p_referral_bonus integer DEFAULT null,
  p_monthly_bonus integer DEFAULT null,
  p_admin_grant integer DEFAULT null,
  p_battle_adjustment integer DEFAULT null,
  p_used integer DEFAULT null,
  p_locked_arena integer DEFAULT null,
  p_calculation_method text DEFAULT 'DIRECT_QUERY',
  p_client_version text DEFAULT null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.free_credit_audit_log(
    profile_id, event_type, remaining_free,
    guest_limit, signup_bonus, follower_bonus, referral_bonus, monthly_bonus, admin_grant, battle_adjustment, used, locked_arena,
    calculation_method, client_version
  ) values (
    p_profile_id, 'BALANCE_CALCULATED', p_remaining_free,
    p_guest_limit, p_signup_bonus, p_follower_bonus, p_referral_bonus, p_monthly_bonus, p_admin_grant, p_battle_adjustment, p_used, p_locked_arena,
    p_calculation_method, p_client_version
  );
end;
$$;

-- Fonction d'audit: Détecter les écarts entre deux migrations
create or replace function public.free_credit_audit_check_discrepancies(p_profile_id uuid)
returns table (
  found_discrepancy boolean,
  last_known_balance integer,
  current_balance integer,
  discrepancy integer,
  days_since_last_audit integer
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_last_audit record;
  v_current_remaining integer;
begin
  -- Obtenir le dernier audit connu
  select * into v_last_audit from public.free_credit_audit_log
  where profile_id = p_profile_id
  order by created_at desc
  limit 1;

  -- Calculer le solde actuel
  v_current_remaining := public.keep_theoretical_free_credit_remaining_for_profile(p_profile_id);

  -- Comparer
  if v_last_audit.remaining_free is not null then
    return query select
      (v_last_audit.remaining_free != v_current_remaining),
      v_last_audit.remaining_free,
      v_current_remaining,
      (v_current_remaining - v_last_audit.remaining_free),
      extract(day from (now() - v_last_audit.created_at))::integer;
  else
    return query select false, 0, v_current_remaining, 0, 0;
  end if;
end;
$$;

-- Helper: Lister tous les utilisateurs avec discrepancies (audit à grande échelle)
create or replace function public.free_credit_audit_list_affected_users()
returns table (
  profile_id uuid,
  username text,
  last_known_balance integer,
  current_balance integer,
  discrepancy integer,
  days_since_audit integer
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  return query
  select
    p.id,
    p.username,
    (select remaining_free from public.free_credit_audit_log where profile_id = p.id order by created_at desc limit 1)::integer,
    public.keep_theoretical_free_credit_remaining_for_profile(p.id),
    public.keep_theoretical_free_credit_remaining_for_profile(p.id) -
      coalesce((select remaining_free from public.free_credit_audit_log where profile_id = p.id order by created_at desc limit 1), 0),
    extract(day from (now() - (select created_at from public.free_credit_audit_log where profile_id = p.id order by created_at desc limit 1)))::integer
  from profiles p
  where (public.keep_theoretical_free_credit_remaining_for_profile(p.id) -
      coalesce((select remaining_free from public.free_credit_audit_log where profile_id = p.id order by created_at desc limit 1), 0)) != 0
  order by discrepancy desc;
end;
$$;

-- IMPORTANT: Ajouter à keep_free_credit_breakdown() un appel automatique au logging
-- (modifié dans une migration future pour chaque appel à la fonction)
