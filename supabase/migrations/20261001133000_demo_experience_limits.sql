-- Demo experience guardrails are remote-configurable from Super Admin.
-- Preserve existing values if an admin already changed them; only refresh descriptions.

insert into public.remote_config(key,value,description)
values
  (
    'demo_listen_limit',
    '8'::jsonb,
    'Nombre maximal de morceaux reconnus en mode démo sur cet appareil avant de demander la création ou connexion à un vrai profil.'
  ),
  (
    'demo_discovery_locked',
    'true'::jsonb,
    'Si true, l’onglet Découvertes est verrouillé en mode démo et demande un vrai profil Loki Music.'
  )
on conflict(key) do update
set description=excluded.description,
    updated_at=now();
