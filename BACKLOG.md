# LOKI — BACKLOG (à faire)

## PRIORITÉ 1 — Vente de musique
- [ ] Masquer le titre + l'artiste + la jaquette avant achat
- [ ] Pré-écoute de 15 secondes masquée
- [ ] Pré-écoute masquée pour une playlist complète
- [ ] Exposer les ventes proprement sur le profil utilisateur

## PRIORITÉ 2 — Battle
- [ ] Battle solo sans-faute = +3 Free

## PRIORITÉ 3 — Notifications
- [ ] Notifications granulaires (films, musique, abonnements, likes)
- [ ] Pub non désactivable pour non-abonnés

## PRIORITÉ 4 — Viralité
- [ ] Notification aux 1000 personnes qui ont repris une musique
- [ ] Compte publicitaire (publication payante)

## PRIORITÉ 5 — Films (V2)
- [ ] Shazam un film → ajout au profil
- [ ] Notification aux abonnés "X a regardé tel film"

## PRIORITÉ 6 — Design & Communication
- [ ] Audit design complet (taille des écritures, espacements)
- [ ] Vidéo explicative (agent gratuit ou humain)
- [ ] Slogan : "Loki — Ta vibe, notre tribu."

## PRIORITÉ 7 — Conformité légale/fiscale marketplace (décisions Adel, 21/09/2026)

Suite à l'audit `docs/PLATFORM_COMPLIANCE.md` §9. Pas urgent tant que
`playlist_marketplace` reste désactivé (voir migration
`20260921200000_disable_playlist_marketplace_pending_apple_review.sql`),
mais à traiter avant tout gros lancement de la marketplace.

- [ ] **DAC7 / obligations fiscales plateforme** — pas urgent. Seuils
  2000€ OU 30 transactions/an par vendeur → transmission à
  l'administration fiscale. Chantier technique réel (agrégation annuelle
  sur `playlist_sale_payments`, pas une case à cocher) : voir
  `docs/PLATFORM_COMPLIANCE.md` §9.6 pour le détail de ce qui manque.
- [ ] **SACEM / droit voisin** — à traiter avant un gros lancement, pas
  avant. Vendre l'accès à une sélection curatée de morceaux (même sans
  transférer de fichier) reste le point juridique le plus incertain de
  l'audit (`docs/PLATFORM_COMPLIANCE.md` §9.5). **Recommandation : faire
  relire ce point précis par un avocat spécialisé propriété
  intellectuelle/droit du numérique avant d'exposer la marketplace à un
  volume significatif d'utilisateurs.**
- [ ] Validation Apple/Google IAP avant réactivation du flag
  `playlist_marketplace` (voir §9.3 de l'audit).
