-- KEEP — 0019: débloque les routes Super Admin Plans/Prix/Entitlements/Quotas
-- déjà écrites (packages/backend/src/routes/admin.ts) sans dépendre de
-- service_role (toujours un placeholder, voir .env -- cf. audit du
-- 24/08/2026, même cause déjà trouvée pour la page Utilisateurs le
-- 24/08/2026 précédent : adminClient construit avec une clé invalide,
-- CONFIGURED=true à tort, chaque requête échoue silencieusement en 401).
-- Même pattern que 0014 (subscriptions_admin_write) : RLS + is_admin(),
-- jamais une deuxième logique parallèle.

create policy plans_admin_write on plans for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
create policy plan_prices_admin_write on plan_prices for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
create policy usage_limits_admin_write on usage_limits for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
create policy plan_entitlements_admin_write on plan_entitlements for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- Journal d'audit -- écrit via fonction SECURITY DEFINER plutôt qu'une policy
-- INSERT ouverte à "tout admin" directement sur audit_logs (garde la table
-- elle-même fermée par défaut, seule cette fonction précise peut y écrire).
create or replace function log_admin_action(
  p_action text, p_target_type text, p_target_id text, p_before jsonb, p_after jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then
    raise exception 'not_admin';
  end if;
  insert into audit_logs (actor_admin_id, action, target_type, target_id, before, after)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_before, p_after);
end;
$$;
