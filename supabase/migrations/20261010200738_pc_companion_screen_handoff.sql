-- Reprise de la migration additive appliquée en production le 10/10/2026.
-- Ordres d'ouverture d'onglet transmis uniquement via keep-web-pairing après vérification du propriétaire.
alter table public.web_companion_sessions
  add column if not exists requested_screen text,
  add column if not exists screen_request_id uuid;
