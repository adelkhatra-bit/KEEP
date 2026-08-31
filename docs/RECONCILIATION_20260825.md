# KEEP — Réconciliation Claude Code / main — 25 août 2026

## Sources protégées
- `main` : source distante actuelle, base de la réconciliation.
- `claude-local-backup-20260825` : sauvegarde intégrale du travail local Claude Code.
- SHA sauvegarde Claude : `ebe49fefcc6ad9c60d94e79ead1770db0934ee97`.

## Règle absolue
Ne jamais remplacer `main` par la branche Claude. Importer sélectivement les fonctions utiles dans cette branche de réconciliation, puis tester avant fusion.

## À conserver depuis `main`
- Navigation 5 onglets : Écouter / Découvertes / Playlists / Soirées / Profil.
- `PartiesScreen` séparé.
- `ProfilePublicScreen` pour le profil propriétaire visible.
- `ProfileScreen` pour les réglages privés.
- `PublicUserProfileScreen` pour les profils des autres utilisateurs.
- `NotificationsScreen` et route Notifications.
- `MusicConnectionsScreen`.
- Design néon actuel de l'écran Écouter.
- Workflows source-of-truth et chaîne web/mobile actuelle.
- Un seul lanceur local canonique.

## À récupérer depuis Claude si compatible
- Tunnel gratuit et crédits dynamiques backend (`CreditCounter`, `billingApi`, remote config).
- Règle : détection/PASS = 0 crédit ; seul KEEP/téléchargement consomme.
- Animation micro et pipeline de capture réel.
- Spotify / YouTube / Apple Music connexions manquantes.
- Backend recognition, billing, auth e-mail hooks, remote config.
- Tests E2E mobile/admin.
- Migrations Supabase 0012–0023 utiles non déjà remplacées par le schéma production.
- Design system/documentation validée (`KEEP_DESIGN_SYSTEM.md`, décisions, regression tests).
- Fonctions Super Admin utiles : recherche utilisateur, plans, attribution d'accès, recognition dashboard.

## Ne pas réintroduire depuis Claude
- Navigation 4 onglets.
- `ProfileScreen` directement comme onglet Profil.
- Anciennes routes qui remplacent les routes actuelles.
- Ancien login admin si moins sûr ou incompatible avec l'architecture actuelle.
- Données démo présentées comme réelles.
- Secrets, tokens, `.env` ou fichiers temporaires `.cc-scratch-*` dans `main`.

## Contrôles obligatoires avant fusion
1. Typecheck mobile/admin/backend/music.
2. Tests unitaires.
3. Smoke web : 5 onglets, session, profil, notifications, soirées.
4. Auth réelle Supabase : création/connexion compte.
5. Profil public : seulement `KEPT + PUBLIC`.
6. Masquage individuel des titres propriétaire.
7. Super Admin : authentification réelle ou mode test clairement isolé.
8. Android build installable.
9. Aucun secret committé.
10. Une seule source de vérité locale/distante.
