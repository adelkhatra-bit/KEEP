# KEEP — Reste à faire (par priorité, cf. cahier des charges §93)

## Priorité 1-2 — Cœur musical (EN COURS)
- [ ] Débloquer npm/Expo (voir PROJECT_STATUS.md ACTION UTILISATEUR REQUISE) et
      confirmer que KEEP Mobile s'affiche réellement sur iPhone (Milestone 1).
- [ ] Implémenter un vrai `MusicProviderAdapter` Apple Music (MusicKit) — provider
      principal retenu (voir PLATFORM_COMPLIANCE.md).
- [ ] Implémenter un vrai `MusicProviderAdapter` Spotify (Development Mode, 5
      comptes max) en parallèle.
- [ ] Implémenter un vrai `MusicRecognitionProvider` AudD (clé API requise).
- [ ] Remplacer le micro DEMO par un vrai enregistrement `expo-av`/`expo-audio`.
- [ ] Déployer le schéma Supabase (`supabase/migrations/`) sur un vrai projet.
- [ ] Brancher Supabase Auth (email + Sign in with Apple + Google) dans
      `OnboardingScreen`/`useUserStore` — actuellement affiche honnêtement
      "pas connecté" au lieu de simuler une connexion.

## Priorité 3 — Profil + partage + Compare
- [ ] Écran profil complet (photo, styles musicaux, réseaux sociaux publics/privés).
- [ ] Champs facultatifs date de naissance/genre déjà modélisés en base
      (`profile_private_info`, RLS propriétaire uniquement) — UI à construire.
- [ ] Deep link `keep://profile/:username` + résolution web publique.
- [ ] Écran Compare nos KEEP (peut réutiliser `compareMusicDNA` si le flag
      `keep_dna` est activé, sinon comparaison simple par morceaux communs).
- [ ] PRENDRE SES SONS → RANGER CHEZ MOI (réutilise `SmartPlaylistRouter`
      du destinataire, déjà prêt).

## Priorité 4 — Super Admin + monétisation
- [ ] Construire réellement `packages/admin` (actuellement une page vide) :
      Dashboard, Utilisateurs, Abonnements, Paiements, Comptabilité de gestion,
      Coûts & Rentabilité, Analytics produit, Feature flags, Rôles/RBAC, Logs.
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
- [ ] Compte Apple Developer / Google Play Console (ACTION UTILISATEUR).
- [ ] Fiches store (nom, description, mots-clés, captures, politique de
      confidentialité publiée, notes de review expliquant que KEEP route
      vers des comptes existants — cf. Guideline 4.2.2).

## Documentation restante (§85 du cahier des charges)
- [ ] ARCHITECTURE.md, DATABASE.md, SECURITY.md, PRIVACY.md, PAYMENTS.md,
      DEPLOYMENT.md, TESTING.md — non rédigés faute de temps dans cette
      session ; PROJECT_STATUS.md et RESTE_A_FAIRE.md sont à jour.

## Dette technique connue
- Tests Jest écrits mais jamais exécutés via Jest (voir PROJECT_STATUS.md) —
  à relancer avec `npm test` dès que l'installation est possible.
- `packages/backend` et `packages/admin` n'ont pas de tests du tout.
- Pas encore de CI/CD (§78) — à mettre en place une fois le repo poussable.
