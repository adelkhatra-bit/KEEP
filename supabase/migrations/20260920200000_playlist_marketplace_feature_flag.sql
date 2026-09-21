-- KEEP — flag "playlist_marketplace" (Adel, 20/09/2026) : la vente/achat de
-- playlists paie via un lien de paiement PERSONNEL du vendeur (PayPal.me,
-- Lydia, etc. -- voir playlist_sale_payments), pas via Apple In-App
-- Purchase. Pour un contenu numérique déverrouillé dans l'app, Apple exige
-- l'IAP -- ce circuit externe expose donc l'app à un rejet/retrait App
-- Store tant qu'aucun IAP réel n'existe pour ce flux précis.
--
-- Désactivé par défaut (coming soon) : VENDRE, ACHETER et l'aperçu de
-- pré-écoute restent dans le code, prêts à être réactivés d'un clic en
-- Super Admin une fois un moyen de paiement conforme Apple branché sur ce
-- flux (IAP réel, ou retrait du circuit pour la version iOS).
insert into public.feature_flags(key, description, is_enabled_globally, rollout_percent)
values (
  'playlist_marketplace',
  'Marketplace playlists (VENDRE/ACHETER + pré-écoute) — paiement par lien externe, désactivé tant que non conforme Apple IAP',
  false,
  0
)
on conflict (key) do update set description = excluded.description, updated_at = now();
