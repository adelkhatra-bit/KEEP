-- Demo listening budget controlled by Super Admin.
insert into public.remote_config(key,value,description,updated_at)
values(
  'demo_listen_limit',
  '8'::jsonb,
  'Nombre maximum de morceaux que le mode démo peut identifier/écouter sur cet appareil avant de demander la création ou la connexion à un compte. La limite ne s’applique jamais à un compte connecté.',
  now()
)
on conflict(key) do update
set value=excluded.value,
    description=excluded.description,
    updated_at=now();
