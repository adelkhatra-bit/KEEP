insert into public.remote_config (key, value, description)
values (
  'auth_require_verified_email',
  'false'::jsonb,
  'Activation globale depuis le Super Admin : demande une adresse e-mail vérifiée aux comptes KEEP existants sans supprimer ni recréer leur profil.'
)
on conflict (key) do nothing;
