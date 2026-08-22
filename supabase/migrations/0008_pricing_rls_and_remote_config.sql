-- KEEP — 0008: RLS manquante sur les tables commerce/admin (0003/0005) +
-- seed remote_config pour les réglages Super Admin (session_silence_timeout_minutes).
--
-- Trouvé le 22/08/2026 en préparant le backend Super Admin réel : plans,
-- plan_prices, features, plan_entitlements, usage_limits, promotions,
-- promo_codes, operating_costs, feature_flags, remote_config,
-- provider_health n'avaient AUCUNE policy RLS (contrairement à
-- admin_users/audit_logs dans 0006_rls.sql, qui étaient déjà protégées).
-- Toute mutation Super Admin passe désormais exclusivement par le backend
-- (service role, voir packages/backend/src/routes/admin.ts) -- ce fichier
-- distingue donc lecture publique nécessaire à l'app (pricing/feature
-- flags affichés à l'utilisateur) et données strictement internes.

alter table plans enable row level security;
alter table plan_prices enable row level security;
alter table features enable row level security;
alter table plan_entitlements enable row level security;
alter table usage_limits enable row level security;
alter table feature_flags enable row level security;
alter table promotions enable row level security;
alter table promo_codes enable row level security;
alter table operating_costs enable row level security;
alter table remote_config enable row level security;
alter table provider_health enable row level security;

-- Lecture publique nécessaire : l'app doit pouvoir afficher les prix/plans
-- et évaluer les feature flags/quotas sans passer par le backend à chaque
-- écran. Écriture réservée au service role (Super Admin backend) --
-- aucune policy "for update/insert/delete" ci-dessous, donc refusée par
-- défaut pour authenticated/anon.
create policy plans_select_all on plans for select using (true);
create policy plan_prices_select_all on plan_prices for select using (true);
create policy features_select_all on features for select using (true);
create policy plan_entitlements_select_all on plan_entitlements for select using (true);
create policy usage_limits_select_all on usage_limits for select using (true);
create policy feature_flags_select_all on feature_flags for select using (true);

-- Strictement internes -- jamais lues/écrites hors service role (données
-- financières/opérationnelles sensibles, ou sans besoin client établi).
create policy promotions_none on promotions for all using (false);
create policy promo_codes_none on promo_codes for all using (false);
create policy operating_costs_none on operating_costs for all using (false);
create policy remote_config_none on remote_config for all using (false);
create policy provider_health_none on provider_health for all using (false);

-- Réglage session (durée de silence avant proposition de fin de session) --
-- voir packages/mobile/src/store/useSessionStore.ts
-- (DEFAULT_SESSION_SILENCE_TIMEOUT_MIN) et packages/admin (Réglages session).
-- Valeur par défaut identique aux deux pour ne jamais diverger au premier démarrage.
insert into remote_config (key, value, description) values
  ('session_silence_timeout_minutes', '10'::jsonb, 'Fin de session proposée après une absence de musique de (minutes)')
on conflict (key) do nothing;
