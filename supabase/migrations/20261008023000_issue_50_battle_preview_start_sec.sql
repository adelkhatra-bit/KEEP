-- Issue #50 Part A: battle_preview_start_sec remote_config
-- Position dans l'audio, jamais un délai avant le démarrage synchronisé.

INSERT INTO public.remote_config (key, value, description)
VALUES (
  'battle_preview_start_sec',
  '12'::jsonb,
  'Position de départ de l’extrait audio Battle/Solo (0-20 secondes, défaut 12), pas un délai.'
)
ON CONFLICT (key) DO NOTHING;

alter table public.remote_config add constraint battle_preview_start_sec_bounds
check (key <> 'battle_preview_start_sec' or
  (jsonb_typeof(value) = 'number' and (value::text)::numeric between 0 and 20));

-- Audit : clé visible dans Super Admin pages/remote-config.tsx groupe BATTLE
-- RPC existing admin_remote_config_set/list gère la sauvegarde à distance
