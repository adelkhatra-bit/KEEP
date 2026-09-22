# KEEP (Loki Music) — État du projet (source de vérité unique)

Ce fichier est le tableau de bord central pour **toute IA** qui travaille sur ce
dépôt (Claude Code, Codex, Cursor, Claude Design, futurs agents). Il **unifie**
les mémoires existantes sans les dupliquer — chacune garde son rôle :

| Fichier | Rôle |
|---|---|
| **`PROJECT_STATE.md`** (ce fichier) | Tableau de bord : état git, fonctionnalités, points ouverts, APIs — le point d'entrée. |
| `CLAUDE.md` / `AGENTS.md` | Règles de travail (protocole, verrous, ce qu'on ne touche jamais). Toujours prioritaires en cas d'écart. |
| `AGENT_MESSAGES.md` | Journal chronologique inter-agents (qui a fait quoi, en détail). |
| `.context/activeContext.md` | Contexte court terme (tâche en cours, décisions récentes) — mis à jour en fin de session importante. |
| `DESIGN_SYSTEM.md` | Règles visuelles (palette, typographie, composants). |
| `BACKLOG.md` | Fonctionnalités futures priorisées, pas encore commencées. |
| `docs/PLATFORM_COMPLIANCE.md` | Conformité légale/fiscale (RGPD, DAC7, SACEM, IAP). |
| `APP_STORE_CHECKLIST.md` / `APP_STORE_REVIEW_NOTES.md` | Soumission App Store : bloquants, notes reviewer. |

**⚠️ Archivés — ne plus utiliser comme référence d'état actuel** : `docs/PROJECT_STATUS.md`
et `docs/RESTE_A_FAIRE.md` datent d'août 2026 (avant la refonte design, avant
Loki Battle, avant la marketplace, avant le renommage Loki Music) et ne sont
plus maintenus. Conservés pour l'historique (rien ne disparaît), mais
**`PROJECT_STATE.md` fait foi pour l'état actuel**, pas eux.

**Règle imposée à toute IA** : lire ce fichier avant toute session de travail.
Mettre à jour la section « Points ouverts » (et lancer
`node scripts/update-project-state.cjs` pour les sections git) avant tout commit
significatif.

---

## 1. État actuel

<!-- AUTO:GIT-STATE:START -->
- Régénéré le : 2026-09-22T15:41:05.791Z
- Branche : `reconcile/claude-main-20260825`
- Dernier commit : `2767c3a` (2767c3ac6029be1a82e29e772648b7d8dd407bab) — feat(mobile): refonte layout PartiesScreen (spec Adel 22/09/2026)
- Date du dernier commit : 2026-09-22T17:39:04+02:00
- Working tree : ⚠️ modifications non commitées présentes
<!-- AUTO:GIT-STATE:END -->

**Statut global** : application mobile/web en production active (GitHub Pages +
TestFlight), fonctionnalités cœur (auth, écoute/reconnaissance, Découvertes,
Playlists, Battle, profils, notifications) opérationnelles. Marketplace de
playlists **désactivée sur iOS** (conformité App Store 3.1.1, web-only pour
l'instant — décision Adel du 21-22/09/2026). Soumission App Store en attente
d'actions externes (voir `APP_STORE_CHECKLIST.md`).

---

## 2. Fonctionnalités actives

Légende : ✅ fonctionnel · ⚠️ partiel · ❌ cassé · 🚧 manquant/non câblé.
Statuts basés sur audits réels effectués dans ce dépôt (pas des suppositions) ;
un statut sans référence explicite n'a pas encore été revérifié depuis la
dernière refonte majeure et doit être traité comme « à confirmer ».

### Cœur produit
- ✅ Auth (pseudo + mot de passe + e-mail vérifié obligatoires depuis le
  01/09/2026 ; connexion par pseudo OU e-mail pour compatibilité anciens
  comptes) — `authService.ts`, `keep-username-auth`.
- ✅ Essai gratuit invité (3 Free) + bonus inscription (+20 Free) = 23 Free
  avant abonnement.
- ✅ Écouter (Home) — reconnaissance audio serveur (AudD + repli ACRCloud),
  aucun secret provider côté mobile.
- ✅ Découvertes (Loki Swipe) — swipe multi-morceaux, autoplay web fiabilisé.
- ✅ Playlists (Mes Musiques) — refonte DESIGN_SYSTEM v3 faite (21/09/2026,
  `TrackActionRow` unifié, hauteur de carte fixe).
- ✅ Loki Battle solo + arène multijoueur — préchargement audio manche N+1
  ajouté le 22/09/2026 (`2562f5e`), fix conflit micro/preview corrigé
  (`a98868f`).
- ⚠️ Marketplace de playlists (vente/achat) — fonctionnelle **web uniquement** ;
  flag `playlist_marketplace` **désactivé** côté mobile/iOS depuis le
  21/09/2026 (conformité 3.1.1, pas d'IAP câblé). Paiement 100% manuel (lien
  PayPal/perso du vendeur, confirmation manuelle, aucune API de paiement
  réelle intégrée). Anti-Shazam sur les previews implémenté le 22/09/2026
  (`54a269d`) — test réel Shazam en attente (Adel, sur device).
- ✅ Profils (personnel `ProfilePublicScreen.tsx` + public visité
  `PublicUserProfileScreen.tsx`) — refonte DESIGN_SYSTEM v3 **partielle** :
  la grille de morceaux (`TrackActionRow`) est refaite sur les deux écrans,
  mais l'en-tête/bio/réseaux sociaux/section marketplace du profil visité
  restent sur l'ancien système de couleurs (voir audit Bloc 2, 22/09/2026).
- ✅ Notifications, Historique de sessions — fonctionnels, refonte visuelle
  DESIGN_SYSTEM v3 **non faite** (audit Bloc 2, 22/09/2026).
- 🚧 Refonte DESIGN_SYSTEM v3 — non faite sur : Accueil « Écouter »,
  Découvertes, Soirées (écran lobby `PartiesScreen.tsx`), Notifications,
  Paramètres. Audit complet + priorités dans la conversation du 22/09/2026
  (pas encore un fichier dédié — à consolider si une nouvelle refonte
  démarre).

### Paiements / conformité
- ⚠️ Stripe — clé secrète et clé publique **inversées** en base
  (`integration_secrets`), à corriger côté Adel. Non fonctionnel tel quel.
- 🚧 Apple IAP — 0/6 secrets Apple configurés dans Supabase
  (`APPLE_IAP_ISSUER_ID/KEY_ID/PRIVATE_KEY`, `APPLE_MUSICKIT_*`) au 22/09/2026 ;
  3 secrets MusicKit existent côté Vercel (`packages/backend`) mais pas dans
  Supabase — écart entre ce que montre le dashboard Super Admin (qui ne lit
  que Supabase) et la réalité. Voir `APP_STORE_CHECKLIST.md`.
- ⚠️ Conformité légale marketplace (DAC7, SACEM/droit voisin) — documentée,
  pas urgente tant que la marketplace reste petite/désactivée sur iOS. Voir
  `BACKLOG.md` priorité 7 et `docs/PLATFORM_COMPLIANCE.md` §9.

### Emails
- ✅ E-mails transactionnels (auth + compte) unifiés le 22/09/2026
  (`f4d150d`) : gabarit HTML partagé (`_shared/lokiEmailShell.ts`), retry
  Mailjet→Brevo (`_shared/lokiEmailSend.ts`), secret HMAC dédié
  (`ACCOUNT_EMAIL_CODE_SECRET`, repli transparent sur SERVICE_ROLE si absent).

### Branding
- ✅ « Loki Music » cohérent partout (app, e-mails, Super Admin, web) —
  vérifié le 22/09/2026. « KEEP » comme verbe visible à l'écran remplacé par
  « garder »/« gardé » (`a12d641`) ; identifiants techniques (`keep_*`,
  `keep://`, `KeepBattleDecision`) volontairement non touchés.

### Non audité dans ce dépôt (à faire — voir mission API en cours)
- 🚧 État exhaustif de toutes les intégrations externes (GitHub Actions,
  Render, Vercel, EAS, Google, Sentry, Telegram, Notion, Slack, AudD/ACRCloud
  au-delà du strict nécessaire recognition) — audit partiel seulement
  (Stripe + Apple IAP, voir ci-dessus). Mission en cours, voir section 6.

---

## 3. Dernières modifications (10 derniers commits)

<!-- AUTO:RECENT-COMMITS:START -->
- `2767c3a` (2026-09-22, adelkhatra-bit) — feat(mobile): refonte layout PartiesScreen (spec Adel 22/09/2026)
- `d85c8d9` (2026-09-22, adelkhatra-bit) — feat(mobile): refonte layout DiscoverScreen (spec Adel 22/09/2026)
- `8cd3a09` (2026-09-22, adelkhatra-bit) — feat(mobile): refonte layout HomeScreenCompact (spec Adel 22/09/2026)
- `d7df56a` (2026-09-22, adelkhatra-bit) — style(mobile): migrer HomeScreenCompact/Discover/Parties vers les tokens colors.ts (design system strict)
- `b7ec85b` (2026-09-22, adelkhatra-bit) — docs: [A VALIDER] supprimer workflow obsolete eas-build-ios.yml (Apple 401, permission workflows requise cote Adel)
- `18ffee6` (2026-09-22, adelkhatra-bit) — docs(agent-messages): Abacus -- diagnostic app/build (push OK, web OK, iOS build via auto-eas-build en cours; eas-build-ios obsolete Apple 401)
- `4a29bae` (2026-09-22, adelkhatra-bit) — docs(agent-messages): Abacus -- reconciliation branches strategie C (fix eas.json + fichiers agents), hash 33a7fc1
- `f766644` (2026-09-22, adelkhatra-bit) — chore(reconcile): port eas.json prod fix (remove hardcoded Supabase env) + recover agent coordination files from main
- `580f483` (2026-09-22, adelkhatra-bit) — chore(state): regenerate PROJECT_STATE.md after pull 3276a24
- `3276a24` (2026-09-22, adelkhatra-bit) — fix(marketplace): resolve price save error + detailed error messages
<!-- AUTO:RECENT-COMMITS:END -->

Détail complet de chaque mission : `AGENT_MESSAGES.md` (journal narratif par
agent) et messages des sessions de chat (non versionnés).

---

## 4. Points ouverts

- **Test device en attente (Adel)** : préchargement audio Battle (latence),
  correctif micro/preview, anti-Shazam (« lance Shazam pendant la preview »).
  Aucun de ces tests n'a pu être fait depuis cet environnement (pas de
  téléphone/micro/haut-parleur/Shazam ici).
- **Stripe** : clé secrète/publique inversées — à corriger par Adel dans
  `integration_secrets` (aucune IA ne doit écrire une valeur de clé secrète).
- **Apple IAP/MusicKit** : secrets manquants côté Supabase — à configurer par
  Adel (voir `APP_STORE_CHECKLIST.md` pour la liste exacte).
- **Bloc 2 (refonte design)** : audit livré le 22/09/2026 (Accueil,
  Découvertes, Soirées en priorité haute) — en attente du choix d'Adel sur
  les 3 écrans à maquetter en premier.
- **Mission API/Super Admin (en cours, 22/09/2026)** : voir section 6 —
  infrastructure de mémoire partagée (ce fichier + hooks) livrée en premier
  comme demandé ; audit API exhaustif et intégration Super Admin à suivre,
  après validation de ce rapport par Adel.
- **[À VALIDER] (Adel) — workflow iOS obsolète** : `eas-build-ios.yml`
  (« Build iOS EAS + TestFlight ») est à supprimer/désactiver par
  l'utilisateur. Il échoue systématiquement sur une erreur Apple 401
  (Distribution Certificate non validé + provisioning profiles non
  récupérables + clé App Store Connect API expirée/invalide). Il fait doublon
  et produit un faux ❌ rouge trompeur. **L'app iOS build correctement via
  `auto-eas-build.yml`** (qui bootstrap lui-même le certificat de signature).
  Suppression impossible par les agents IA : le token de l'app GitHub n'a pas
  la permission `workflows`. Action manuelle : github.com →
  `.github/workflows/eas-build-ios.yml` → Delete file → commit.
- Détail exhaustif des chantiers non urgents : `BACKLOG.md`.

---

## 5. Règles absolues (résumé — `CLAUDE.md` fait foi en cas d'écart)

- Toujours répondre en français à Adel.
- **Rien ne disparaît** : aucune fonctionnalité/bouton/texte supprimé sans
  validation explicite — déplacer/masquer/désactiver, jamais effacer.
- **Maquette HTML avant tout changement visuel.**
- Un commit par sujet, jamais un commit fourre-tout.
- Tests verts avant push : `tsc --noEmit`, `jest`,
  `node scripts/verify-source-of-truth.cjs`, `git diff --check`.
- Push sur `reconcile/claude-main-20260825` uniquement ; jamais sur `main` ou
  les branches archive/backup.
- Ne jamais toucher `Navigation.tsx` / `App.tsx` / la barre 5 onglets sans
  validation explicite d'Adel.
- Ne jamais renommer les identifiants techniques internes (`keep_*` en base,
  fonctions `keep-*`, schéma `keep://`, types TypeScript comme
  `KeepBattleDecision`) — seul le texte visible à l'écran suit le branding
  « Loki Music »/« garder ».
- Repository unique `adelkhatra-bit/KEEP`, branche unique
  `reconcile/claude-main-20260825`, URL publique unique
  `https://adelkhatra-bit.github.io/KEEP/`.

---

## 6. Mission stratégique en cours (22/09/2026) — Agents autonomes + audit API

Brief complet donné par Adel le 22/09/2026, exécuté dans l'ordre imposé :

1. **✅ Fait maintenant** : `PROJECT_STATE.md` (ce fichier) + hooks Git
   (`.githooks/pre-commit` en rappel non bloquant, `.githooks/post-merge` qui
   relance `scripts/update-project-state.cjs`) + script de régénération.
2. **🚧 À faire** : audit exhaustif de toutes les APIs (Supabase, GitHub,
   Render, Vercel, EAS, Apple, Google, Stripe/PayPal/Paddle, AudD/ACRCloud,
   Sentry, Brevo/Mailjet, Telegram, Notion/Slack) — état, emplacement de la
   clé, dernière vérification.
3. **🚧 À faire** : intégration Super Admin (page Intégrations étendue) —
   champ clé masquée, bouton Vérifier (test de connexion réel), lien direct
   vers la page de régénération/révocation sur la plateforme externe (jamais
   une révocation automatisée déclenchée depuis l'app elle-même — voir note
   de sécurité ci-dessous).
4. **🚧 À faire** : audit d'exploitation des plateformes (GitHub
   Actions/Codespaces/Security, Supabase Realtime/Vector/Storage, etc.) —
   tableau capacité/statut/action/gain.
5. **🚧 À faire, avec réserve explicite à valider par Adel** : agent de
   surveillance automatique avec « réparation automatique ». Avant de coder
   quoi que ce soit qui modifie la prod tout seul (relancer un workflow,
   corriger une RLS) sur un schedule sans supervision humaine, il faut
   qu'Adel confirme le périmètre exact de ce qu'un agent a le droit de
   corriger seul vs. ce qui doit seulement être remonté en alerte — ce point
   sera reposé explicitement dans le rapport de fin d'étape 1, pas codé en
   silence.

**Note de sécurité (à lire avant l'étape 3)** : les boutons « Régénérer » /
« Révoquer » du brief sont des **liens sortants** vers le dashboard de chaque
plateforme (Stripe, GitHub, Supabase...), pas des appels d'API qui
régénèrent/révoquent une clé de production automatiquement depuis KEEP —
c'est la lecture retenue du brief d'Adel (« ouvre un lien direct »). Aucune
révocation ne doit jamais se déclencher par un simple clic dans le Super
Admin sans repasser par la confirmation propre à chaque plateforme externe.

---

## 7. Fichiers critiques à lire avant toute modification

`CLAUDE.md`, `AGENTS.md`, `AGENT_MESSAGES.md` (derniers messages),
`.context/activeContext.md`, `DESIGN_SYSTEM.md`, `BACKLOG.md`,
`docs/PLATFORM_COMPLIANCE.md`, `APP_STORE_CHECKLIST.md`,
`APP_STORE_REVIEW_NOTES.md`, et ce fichier (`PROJECT_STATE.md`).

---

## 8. APIs et clés — état connu (audit exhaustif = section 6, étape 2)

| Service | État | Emplacement clé | Dernière vérif. |
|---|---|---|---|
| Supabase (URL/anon/service_role) | ✅ configuré | env mobile + Supabase | 22/09/2026 |
| AudD (reconnaissance) | ✅ configuré, server-side only | `integration_secrets` (Supabase) | Session 22/08/2026 |
| ACRCloud (repli reconnaissance) | ✅ configuré, server-side only | `integration_secrets` (Supabase) | Session 22/08/2026 |
| Brevo (e-mail) | ✅ configuré, fallback actif | `integration_secrets` (Supabase) | 22/09/2026 |
| Mailjet (e-mail, priorité) | ✅ configuré | `integration_secrets` (Supabase) | 22/09/2026 |
| Stripe | ❌ clé secrète/publique inversées | `integration_secrets` (Supabase) | 22/09/2026 |
| Apple IAP (3 secrets) | 🚧 non configuré côté Supabase | — | 22/09/2026 |
| Apple MusicKit (3 secrets) | ⚠️ configuré côté Vercel, absent de Supabase | Vercel env (`packages/backend`) | 22/09/2026 |
| PayPal | 🚧 non câblé (lien manuel externe uniquement) | — | 21/09/2026 |
| GitHub / Render / Vercel / EAS / Sentry / Telegram / Notion / Slack | 🚧 non audité dans ce dépôt | — | — |

Cette table sera remplacée par l'audit exhaustif de la section 6, étape 2 —
gardée volontairement courte ici pour ne pas dupliquer un travail pas encore
fait.
