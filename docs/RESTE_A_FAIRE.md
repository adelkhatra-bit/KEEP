# KEEP — Reste à faire (par priorité, cf. cahier des charges §93)

## Priorité 1-2 — Cœur musical (EN COURS)
- [x] Débloquer npm/Expo — fait en session locale le 21/08/2026 (voir
      PROJECT_STATUS.md "Session locale du 21/08/2026") : `npm install`
      réel, plusieurs bugs bloquants corrigés (tsconfig, entrée
      `AppEntry.js`, deps fantômes), bundle Metro réel (`expo export`)
      réussi. Reste : `expo start --tunnel` + scan Expo Go pour confirmer
      l'affichage sur un vrai iPhone (Milestone 1 pas encore coché tant
      que non vu sur l'appareil).
- [x] Implémenter un vrai `MusicProviderAdapter` Apple Music (REST, provider
      principal retenu — voir PLATFORM_COMPLIANCE.md) : écrit et testé
      (14/14, fetch simulé fidèle à la doc Apple). Reste : brancher dans
      `musicEngine` une fois le backend déployé (developer token) et
      valider le flux WebView sur un vrai appareil avec un vrai compte
      Apple Music (impossible depuis ce sandbox).
- [ ] Implémenter un vrai `MusicProviderAdapter` Spotify (Development Mode, 5
      comptes max) en parallèle.
- [x] Implémenter un vrai `MusicRecognitionProvider` AudD : écrit et testé
      (13/13, requête multipart + réponses simulées fidèles à l'API
      réelle). Reste : une vraie clé API (compte audd.io, free tier 300
      requêtes) pour sortir du mock — ACTION UTILISATEUR, voir
      PROJECT_STATUS.md.
- [ ] Remplacer le micro DEMO par un vrai enregistrement `expo-av`/`expo-audio`.
- [x] Schéma Supabase vérifié contre un vrai PostgreSQL 16 (7 migrations +
      triggers + RLS réellement testés, voir PROJECT_STATUS.md et
      `supabase/scripts/verify-migrations.sh` + CI associée). Reste : le
      déployer sur un vrai projet Supabase managé (ACTION UTILISATEUR —
      connecteur Supabase ou création manuelle du projet).
- [ ] Brancher Supabase Auth (email + Sign in with Apple + Google) dans
      `OnboardingScreen`/`useUserStore` — actuellement affiche honnêtement
      "pas connecté" au lieu de simuler une connexion.

## Priorité 3 — Profil + partage + Compare
- [x] Écran profil complet (kind, styles/artistes favoris, réseaux sociaux
      publics/privés, ville/pays, site) — fait 21/08/2026, backé par
      `useUserStore` local (pas encore Supabase, voir statut CONNECTED).
- [x] Champs facultatifs date de naissance/genre — UI construite dans
      `ProfileScreen` (`user.privateInfo`), mappe directement
      `profile_private_info`. Reste : écrire réellement dans cette table
      une fois Supabase déployé (actuellement état local uniquement).
- [ ] Deep link `keep://profile/:username` + résolution web publique
      (le `scheme: "keep"` existe dans `app.json`, mais rien n'écoute
      encore ce lien pour ouvrir un profil précis dans l'app).
- [x] Écran Compare nos KEEP — calcul réel via `compareMusicDNA` sur
      `useSessionHistoryStore`, contre un profil démo tant qu'aucun second
      utilisateur KEEP réel n'existe (voir PROJECT_STATUS.md).
- [ ] PRENDRE SES SONS → RANGER CHEZ MOI (réutilise `SmartPlaylistRouter`
      du destinataire, déjà prêt) — nécessite un vrai second utilisateur,
      pas encore construit (Discover reste en profils démo).

## Priorité 4 — Super Admin + monétisation
- [x] Dashboard, Utilisateurs (recherche + filtre par plan), Abonnements &
      Prix (édition), Coûts & Rentabilité, Feature Flags — construits,
      agrégats/filtres testés (16/16, `packages/admin/scripts/verify.ts`).
      Bannière d'avertissement permanente (sidebar) tant que l'auth n'est
      pas branchée.
- [ ] Paiements, Analytics produit avancé, Logs (audit_logs) — pas encore
      construits.
- [ ] Rôles/RBAC + authentification Super Admin réelle — toujours ouvert,
      voir avertissement dans `AdminLayout.tsx` : ne pas déployer
      publiquement avant ça (n'importe qui pourrait éditer les prix/flags).
- [ ] RBAC + audit logs déjà modélisés en base (`admin_users`, `audit_logs`,
      RLS bloquant tout accès hors service role) — auth Super Admin à construire.
- [ ] Intégration Apple IAP / Google Play Billing (sandbox d'abord —
      obligatoire, voir PLATFORM_COMPLIANCE.md §5-6).
- [ ] Webhooks paiement (Apple Server Notifications V2, Google RTDN).

## Priorité 5 — Creator/DJ/Venue/Events/Local
- [ ] Écrans événements + anti-spam RSVP (tables déjà prêtes :
      `event_recommendation_sends` avec dédup en base).
- [ ] Analytics Creator, outils Venue (QR, capacité).
- [ ] Découverte locale (localisation approximative uniquement).

## Priorité 6 — Stores
- [x] Pipeline CI/CD automatisé prêt : `.github/workflows/eas-build-ios.yml`
      + `eas.json` (profils dev/preview/production, credentials via ASC API
      Key) + assets icône/splash réels. Voir `docs/DEPLOYMENT_TESTFLIGHT.md`
      pour les 3 actions propriétaire restantes (compte Expo, compte Apple
      Developer, fiche App Store Connect) — tout le reste est automatique.
- [ ] Compte Apple Developer / Google Play Console (ACTION UTILISATEUR —
      voir docs/DEPLOYMENT_TESTFLIGHT.md).
- [ ] Fiches store (nom, description, mots-clés, captures, politique de
      confidentialité publiée, notes de review expliquant que KEEP route
      vers des comptes existants — cf. Guideline 4.2.2).
- [ ] Pipeline équivalent Android (`eas build --platform android` +
      `eas submit`) — non prioritaire tant que le cœur iOS n'est pas validé
      en TestFlight, cf. décision produit Apple Music en premier.

## Documentation restante (§85 du cahier des charges)
- [ ] ARCHITECTURE.md, DATABASE.md, SECURITY.md, PRIVACY.md, PAYMENTS.md,
      DEPLOYMENT.md, TESTING.md — non rédigés faute de temps dans cette
      session ; PROJECT_STATUS.md et RESTE_A_FAIRE.md sont à jour.

## Dette technique connue
- Tests Jest écrits mais jamais exécutés via Jest (voir PROJECT_STATUS.md) —
  à relancer avec `npm test` dès que l'installation est possible.
- `packages/backend` et `packages/admin` n'ont pas de tests du tout.
- Pas encore de CI/CD (§78) — à mettre en place une fois le repo poussable.
