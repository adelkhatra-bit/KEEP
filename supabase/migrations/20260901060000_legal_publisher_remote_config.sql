-- Adel (01/09/2026) : "un endroit dans Super Admin pour modifier le nom
-- d'une société / des informations, comme ça j'aurais juste à changer et
-- automatiquement toutes les conditions seront bonnes." Réutilise
-- remote_config (déjà public en lecture, déjà éditable via
-- admin_remote_config_set/l'écran Textes & Quotas) plutôt qu'un nouveau
-- système -- les pages légales statiques (privacy.html, terms.html,
-- mentions-legales.html) lisent ces deux clés en direct au chargement.
insert into public.remote_config(key, value, description)
values
  ('legal_publisher_name', '""'::jsonb, 'Nom de l’éditeur affiché dans les mentions légales/CGU (personne ou société). Vide tant que non renseigné.'),
  ('legal_publisher_contact', '""'::jsonb, 'Contact de l’éditeur (e-mail ou adresse) affiché dans les mentions légales.')
on conflict (key) do nothing;
