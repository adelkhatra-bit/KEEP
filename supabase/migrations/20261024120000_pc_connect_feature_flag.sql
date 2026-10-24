-- 24/10/2026 (Adel) : la version ordinateur est réservée aux développeurs
-- tant qu'elle n'a pas de domaine dédié. Les deux flags sont FERMÉS par
-- défaut ; Super Admin → Feature flags → « comptes de test » pour ouvrir
-- l'accès à un développeur, ou activer globalement le jour du lancement PC.
insert into public.feature_flags(key, description, is_enabled_globally, rollout_percent)
values
  ('web_app', 'Version ordinateur (site web) — réservée aux développeurs tant que fermé', false, 0),
  ('pc_connect', 'Bouton « Connecter mon ordinateur » sur iPhone — réservé aux développeurs tant que fermé', false, 0)
on conflict (key) do nothing;
