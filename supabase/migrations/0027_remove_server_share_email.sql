-- Le partage de profil est désormais effectué par le propre téléphone / client
-- e-mail de l'utilisateur. KEEP n'envoie donc plus d'e-mails de partage et ne
-- conserve plus d'adresses de destinataires pour ce flux.
drop table if exists public.profile_share_emails;
