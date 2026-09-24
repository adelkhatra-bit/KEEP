# CODE GPS — Loki Music / KEEP

Date de référence : 24/09/2026  
Repository unique : `adelkhatra-bit/KEEP`  
Branche de travail unique : `reconcile/claude-main-20260825`

## But

Ce fichier est le **GPS du code**. Il indique où chercher avant de modifier quoi que ce soit, afin d'éviter les doublons, les correctifs dans le mauvais écran et les régressions entre agents.

Toute IA / tout développeur doit lire, dans cet ordre :
1. `CLAUDE.md`
2. `AGENTS.md`
3. `PROJECT_STATE.md`
4. `.context/activeContext.md`
5. `docs/CODE_GPS.md` (ce fichier)
6. `docs/ERROR_LEDGER.md`
7. `docs/INTEGRATION_CHECKLIST.md`
8. les derniers messages de `AGENT_MESSAGES.md`

## Carte générale

| Zone | Source de vérité | Rôle | À ne pas faire |
|---|---|---|---|
| App mobile/web | `packages/mobile/` | React Native + Expo Web | Ne pas créer une deuxième app |
| Navigation | `packages/mobile/src/navigation/Navigation.tsx` | Routes et 5 onglets | Ne pas modifier sans validation explicite |
| Bootstrap app | `packages/mobile/App.tsx` | Racine Expo | Ne pas utiliser pour corriger du responsive |
| Design tokens | `packages/mobile/src/theme/colors.ts` + `DESIGN_SYSTEM.md` | Couleurs/contraste | Pas de nouvelle palette en dur |
| Écouter | `packages/mobile/src/screens/HomeScreenCompact.tsx` | Micro, reconnaissance, passer/garder/arrêter | Ne pas dupliquer la logique micro |
| Découvertes | `packages/mobile/src/screens/DiscoverScreen.tsx` | Découverte utilisateurs | Ne pas recréer le profil public |
| Playlists / bibliothèque | `packages/mobile/src/screens/MyMusicScreen.tsx` | Styles, playlists, artistes, découvertes/reprises | Ne pas créer un second moteur de tri |
| Soirées | `packages/mobile/src/screens/PartiesScreen.tsx` | Événements, RSVP, playlist, lobby | Ne pas casser le multijoueur/Battle |
| Profil propriétaire | `packages/mobile/src/screens/ProfilePublicScreen.tsx` | Son propre profil public | Même architecture que profil visité |
| Profil visité | `packages/mobile/src/screens/PublicUserProfileScreen.tsx` | Profil d'un autre utilisateur | Ne jamais exposer contenu privé/payant |
| Réglages profil | `packages/mobile/src/screens/ProfileSettingsMobileScreen.tsx` | Modification profil | Persistance via services Supabase |
| Onboarding | `packages/mobile/src/screens/onboarding/OnboardingScreen.tsx` | Essai, compte, choix de styles | Ne pas créer une auth parallèle |
| Auth | `packages/mobile/src/screens/auth/` + `services/authService.ts` | Connexion/création/récupération | Pseudo/email passent par la même source serveur |
| Vente playlists | `components/PlaylistSalePanel.tsx` + `services/playlistSaleService.ts` | Offre, prix, historique, livraison | Ne pas dupliquer les offres côté écran |
| Preview payante | `components/PlaylistSaleImmersivePreview.tsx` | Audio masqué avant achat | Jamais titre/artiste/jaquette réels avant achat |
| Smart styles | `services/smartAlbumService.ts` | Smart Albums / classement par genre | Réutiliser ce moteur, ne pas en créer un autre |
| Reconnaissance | `services/musicEngine.ts`, `nativeFirstRecognitionProvider.ts`, `micCapture.ts` | Pipeline micro/reconnaissance | Secrets providers jamais dans le client |
| Localisation | `services/locationService.ts` | GPS → ville/pays | Préremplir puis laisser modifier |
| Profil backend mobile | `services/profileService.ts`, `avatarService.ts` | Profil et avatar Storage | Pas d'état uniquement local |
| Feature flags | `services/featureFlagService.ts` | Fonctions activables | Super Admin reste la source de vérité |
| Stores | `packages/mobile/src/store/` | État client | Ne pas y recopier une source durable serveur |
| Composants communs | `packages/mobile/src/components/` | UI réutilisable | Chercher ici avant de créer un composant |
| Moteur musique | `packages/music/` | Logique provider-agnostic | Éviter la logique métier dupliquée dans les écrans |
| Super Admin | `packages/admin/` | Flags/config/admin | Ne pas exposer de secrets au mobile |
| Backend | `packages/backend/` | APIs serveur | Secrets côté serveur seulement |
| Supabase SQL | `supabase/migrations/` | Schéma/RPC/RLS | Migration additive/idempotente ; jamais modifier l'historique appliqué |
| Supabase Functions | `supabase/functions/` | Edge Functions | Pas de secret dans Git |
| Workflows CI | `.github/workflows/` | Tests/build/deploy | Un seul workflow par capacité ; ne pas masquer un rouge |
| Maquettes | `docs/mockups/` | Design validé avant code | Maquette ≠ état fonctionnel |
| Audits | `docs/audit/` | Diagnostics datés | Ne pas les traiter comme code courant |
| Ops | `docs/ops/` | Procédures exploitation | Pas de secret |
| CI patches | `docs/ci/` | Patches si permission workflow absente | Appliquer uniquement sur la branche unique |
| Sécurité | `docs/security/` | Audit / durcissement | Aucun changement prod aveugle |

## Flux critiques — où regarder

### Profil → Styles → Vente
`ProfilePublicScreen.tsx` / `PublicUserProfileScreen.tsx`
→ `smartAlbumService.ts`
→ `playlistSaleService.ts`
→ `PlaylistSalePanel.tsx`
→ `PlaylistSaleImmersivePreview.tsx`
→ Supabase playlists / playlist_tracks / RPC marketplace.

Règles :
- gratuit : ouvre Swipe du style ;
- payant : cadenas + prix + aperçu masqué ;
- une offre doit être liée à **sa vraie sélection** ;
- aucune fuite gratuite de la même Smart Album/Vibe ;
- après déblocage : état mis à jour sans refresh manuel.

### Profil persistant
`ProfileSettingsMobileScreen.tsx`
→ `profileService.ts`
→ `avatarService.ts`
→ Supabase `profiles` + Storage.

Champs à préserver : pseudo, bio, avatar, ville, pays, date de naissance, genre, réseaux, site web.

### Écouter
`HomeScreenCompact.tsx`
→ session store
→ `micCapture.ts`
→ reconnaissance provider
→ résultat track
→ garder/passer
→ Supabase keep_decisions.

Arrêt micro = arrêt immédiat + libération de la ressource + retour état inactif.

### Soirées
`PartiesScreen.tsx`
→ `creatorEventService.ts`
→ RPC/events Supabase
→ RSVP/playlist/lobby.

Une création doit apparaître immédiatement en état local puis être réconciliée avec Supabase.

### Découvertes
`DiscoverScreen.tsx`
→ profils publics / follow / localisation
→ `PublicUserProfileScreen.tsx`.

Ne pas recopier les détails du profil dans Discover : la carte reste compacte.

### Inscription
`OnboardingScreen.tsx`
→ auth screens/services
→ création profil serveur
→ préférences styles
→ profil.

Aucune donnée obligatoire ne doit rester uniquement dans un state React.

## Design profil Styles — référence actuelle

- Spec : `docs/PROFILE_STYLE_COMMERCE_REDESIGN.md`
- Maquette : `docs/mockups/ProfileStylesMarketplace.html`
- Audit : `docs/audit/AUDIT_UX_FUNNEL_20260924.md`

Commits déjà présents à conserver et auditer :
- `654ed541` — profil visité Styles.
- `ca41db86` — profil propriétaire Styles + Inviter/Partager + ventes.
- `a9ddb531` — dossier payant relié à sa vraie offre.

## Matrice "je trouve un bug → où je vais"

| Symptôme | Premier fichier à auditer | Deuxième niveau |
|---|---|---|
| TypeScript écran | écran concerné | type/service importé |
| Donnée profil perdue au reload | `profileService.ts` | SQL/RLS/Storage |
| Mauvaise offre/prix | `playlistSaleService.ts` | RPC marketplace |
| Style mal classé | `smartAlbumService.ts` | `packages/music` taxonomy |
| Micro ne s'arrête pas | `HomeScreenCompact.tsx` | `micCapture.ts` / session store |
| Soirée absente après création | `PartiesScreen.tsx` | `creatorEventService.ts` |
| 404 Web | `web-preview-pages.yml` | routing Expo/Pages |
| Build Android | `app.json` + plugins | workflow Android |
| Build iOS | `app.json`, `eas.json` | workflow EAS/Apple credentials |
| Couleur/contraste | `colors.ts` | composant/écran |
| Bouton 5 onglets | `Navigation.tsx` | **ne pas modifier sans validation** |

## Règle anti-doublon

Avant de créer un fichier/service/store/RPC :
1. chercher le nom métier dans `packages/mobile/src`, `packages/music` et `supabase`;
2. lire les services existants ;
3. vérifier `ERROR_LEDGER.md`;
4. étendre la source existante si elle couvre déjà le besoin ;
5. seulement ensuite créer une nouvelle brique.

## Preuve minimale avant "corrigé"

- TypeScript propre sur le scope touché.
- Tests existants adaptés sans les affaiblir.
- `git diff --check`.
- Web 390×844 pour une modification visuelle.
- Test fonctionnel ciblé.
- CI : distinguer clairement les erreurs causées par le commit des bloqueurs externes/préexistants.
- Ajouter/mettre à jour l'erreur dans `docs/ERROR_LEDGER.md`.
