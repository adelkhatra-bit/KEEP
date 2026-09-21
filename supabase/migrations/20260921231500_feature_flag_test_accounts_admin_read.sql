-- Le Super Admin (packages/admin) doit pouvoir LIRE le bypass de test d'un
-- compte qu'il inspecte -- la policy posée dans la migration précédente
-- (20260921230000) ne permettait que la lecture de sa propre ligne
-- (auth.uid() = profile_id), inutilisable depuis l'écran utilisateur du
-- Super Admin où l'admin regarde le profil de quelqu'un d'autre.
drop policy if exists "feature_flag_test_accounts_read_own" on public.feature_flag_test_accounts;
create policy "feature_flag_test_accounts_read_own_or_admin" on public.feature_flag_test_accounts for select using (
  auth.uid() = profile_id
  or exists (select 1 from public.admin_users a where a.id = auth.uid() and a.is_active = true)
);
