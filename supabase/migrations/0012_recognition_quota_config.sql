-- KEEP — 0012: quotas de reconnaissance gratuits pilotables depuis Super Admin
-- (cf. demande explicite du 24/08/2026 -- "Le nombre 3 et le seuil 6 doivent
-- être configurables depuis Super Admin", jamais codés en dur). Réutilise
-- `remote_config` (0005_admin.sql), déjà lu/écrit par routes/admin.ts pour
-- `session_silence_timeout_minutes` -- même mécanisme, pas une nouvelle table.

insert into remote_config (key, value, description) values
  ('guest_recognition_limit', '3'::jsonb, 'Reconnaissances gratuites avant inscription obligatoire (invité, non compté par compte)'),
  ('signup_bonus_recognitions', '3'::jsonb, 'Reconnaissances gratuites additionnelles offertes après création du profil (total = guest_recognition_limit + signup_bonus_recognitions avant palier payant)')
on conflict (key) do nothing;
