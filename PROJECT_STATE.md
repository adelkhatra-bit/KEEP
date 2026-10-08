## AVANT TOUTE ACTION
Consulter `.rtk/AGENTS_RULES.md` — règles absolues du projet Loki Music.

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
- Régénéré le : 2026-10-08T03:37:00.722Z
- Branche : `copilot/reconcile-claude-main-20260825`
- Dernier commit : `d6dfca9` (d6dfca99d518284e8413e7281ffba446964a077d) — Ajouter la santé serveur dédupliquée et le triage groupé Super Admin
- Date du dernier commit : 2026-10-08T03:30:09Z
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
- ✅ Économie FREE : invité = 3 reconnaissances réussies au total ; nouveau compte = +5 FREE ; quotas Écouter = 5/30/60/150 par jour selon la formule, puis 1 FREE par reconnaissance réussie. Les comptes créés avant le 04/10/2026 conservent leur bonus historique.
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
- `d6dfca9` (2026-10-08, copilot-swe-agent[bot]) — Ajouter la santé serveur dédupliquée et le triage groupé Super Admin
- `8f85603` (2026-10-08, copilot-swe-agent[bot]) — Initial plan
- `fa193cc` (2026-10-08, adelkhatra-bit) — ci: repare les 2 robots (Human Guardian + diagnostic tchat)
<!-- AUTO:RECENT-COMMITS:END -->

Détail complet de chaque mission : `AGENT_MESSAGES.md` (journal narratif par
agent) et messages des sessions de chat (non versionnés).

---

## Apple iOS — signature non destructive (23/09/2026)

- Bundle principal existant à conserver : `com.adelkhatra.keep` (App Store Connect app `6812393589`, Team `WTG9399DBK`).
- Certificat de distribution et provisioning profile App Store du bundle principal : déjà présents dans EAS/Apple ; la CI doit uniquement les lire et les réutiliser.
- Le bootstrap CI est **read-only** : aucun `POST` de création/modification/révocation de Bundle ID, capability, certificat ou provisioning profile.
- La clé App Store Connect actuelle sait lire l'app, les Bundle IDs, certificats et profils ; un `403` a été observé sur les mutations du Developer Portal. Ne pas contourner ce `403` en recréant des ressources.
- `com.adelkhatra.keep.share-extension` / `LokiShareExtension` est temporairement retirée du premier build TestFlight. Ne pas la recréer automatiquement. Réactivation après la première publication, avec Bundle ID + profil dédiés préparés manuellement puis réintroduits dans la config.
- Les builds iOS utilisent `--freeze-credentials` pour empêcher EAS d'essayer de réparer/créer des credentials pendant un job non interactif.

## 4. Points ouverts

- **08/10/2026 — issue #57, revue Copilot** : Santé serveur et triage groupé ajoutés sans autre runtime/table. Tests SQL isolés, admin typecheck/export et navigateur fixtures 390/1440 ; migrations santé/groupes NON APPLIQUÉES, fonction santé NON DÉPLOYÉE. Valeurs de production de l’issue non revérifiées sans accès Supabase authentifié. Intégration et contrôle réel des alertes Brevo restent nécessaires ; rapport et captures : `docs/SUPERADMIN_AUDIT.md`.
- Revue #57 : premier SHA distant confirmé `d6dfca99d518284e8413e7281ffba446964a077d` ; garde des rétablissements des files renforcé, 11/11 tests serveur. Nouvelle analyse CodeQL après correction du mock Apple ; revue automatique indisponible remplacée par une revue indépendante.

- **07/10/2026 — IDEA-189, LOCAL_ONLY** : tableau versions/preuves dans Opérations existant, SHA/test obligatoires pour les nouveaux « Corrigé », compteurs exacts avec erreurs honnêtes, actionlint épinglé et synthèse GitHub lecture seule. Typechecks admin/mobile, build admin, 1377 tests mobile, PostgreSQL isolé et navigateur fixtures 390/1440 réussis. Migration `/home/runner/work/KEEP/KEEP/supabase/migrations/20261006235000_problem_report_evidence.sql` non appliquée ; intégration/CI/livraison restent à faire par le parent, sans PASS global. Actionlint global hérité rouge, version publique DNS indisponible, TestFlight inconnu. Détails dans `/home/runner/work/KEEP/KEEP/.context/activeContext.md` et `/home/runner/work/KEEP/KEEP/AGENT_MESSAGES.md`.

- **06/10/2026 — Déblocage des intégrations en revue Copilot** : arbre produit `0138b4e5` préservé, contrôles Stories/provenance/empreintes protégées corrigés sans modifier le design ni le runtime. Preuves : 282 suites / 1 377 tests, typechecks mobile/admin/music, gardes et export + navigateur Chromium (PC/tablette/Android, direct + refresh). Reste l'intégration produit et la revalidation CI distante ; aucun déploiement ni vérification iPhone/Firefox/WebKit. Détails : `.context/activeContext.md`.
- **Limites de sécurité du contrôle final** : 11 alertes CodeQL préexistantes dans des fichiers inchangés du produit ; Swift non analysé (création de base échouée). Aucune alerte sur les gardes modifiés ; moteur de revue automatique indisponible.
- **Revue de repli** : agent `code-review` en lecture seule sur le diff produit `0138b4e5..HEAD`, aucun problème significatif détecté. Préservation des données vérifiée après commit ; correctif publié uniquement en revue.
- **🔔 Passe du 05/10/2026 soir (stories/robot/classement/profil/menu) — voir `.context/activeContext.md` (section « À LIRE EN PREMIER »)** : tout est poussé sur la branche, rien n'est confirmé sur iPhone ; commits récents (robot sans partie, menu ☰, Artistes, badge 🔒) non livrés tant qu'un trigger `.eas-build-trigger` n'est pas ajouté ; vérification TestFlight par module, rappel QR ordinateur, mode marketing = restent à faire.
- **Idées d'Adel** : source unique `docs/IDEAS_INBOX.md` (stories musicales, masquage des musiques en vente, barre à 5 onglets, missions…). Toute IA y note chaque nouvelle idée avant de coder.
- **Passe du 05/10/2026 (exécutant, propositions Claude n°8, n°1, n°5, n°9.1-9.2, n°6 sûre)** : robot « page noire » corrigé (le site non connecté affiche l'écran QR ordinateur, le robot simule un appareil approuvé) ; build iOS ShazamKit compatible iOS 15.1 ; Super Admin `/team` responsive ; worker push (marketing, plafond 8/24 h) ; garde OTA liée au build iOS réussi ; écran Offres en 3 cartes ; inventaire des routes (`scripts/verify-route-inventory.cjs`). **Migrations commitées mais NON appliquées en production, accord d'Adel requis** : `20261005013000_keep_admin_marketplace_currency_text`, `20261005050000_push_cap_and_instant_kick` (+ déploiement `keep-push-worker`), `20261005060000_premium_price_4_99`. Restent : barre 5 onglets / menu ☰ / missions (6a-6c), boutique + univers musical (n°8.2-8.4), annuels (produits App Store Connect), n°9.3-9.7.
- **🔴 Connexion impossible (02/10/2026) — base Supabase saturée** : instance
  Micro (1 Go), quota d'I/O disque épuisé (checkpoint de 48 Ko = 11 s, Auth
  « context deadline exceeded » / « failed to connect localhost:5432 »). Action
  **Adel** : Dashboard → Settings → Compute and Disk → Micro → Small. Le code ne
  peut pas lever ce blocage. Verrou anti-récidive en place : contrat
  `authResilience` + `verify-product-contract.cjs` (bloquant publication web/OTA).
- **Contenu utilisateur vérifié intact (02/10 18h UTC)** : profils, playlists (22), titres (181), GARDER (120), abonnements (26), FREE calculés (adel4A 95, othmane 123, teyou 80…). « Contenu manquant » à l'écran = requêtes en échec (serveur saturé), pas une perte.
- **Gouvernance (action Adel)** : activer la protection de branche GitHub sur `reconcile/claude-main-20260825` (PR obligatoire + revue CODEOWNERS + contrôles requis) et passer le connecteur Supabase des IA en lecture seule.
- **Chat (MusicAgoraPanel)** : filet réseau toutes les 2,5 s quand une
  conversation est ouverte — à passer ≥ 5 s après le gel (déclaré dans
  `authResilience.fastIntervalAllowlist`).
- **Tests** : 108 suites Jest en échec AVANT ce correctif (dette existante,
  non causée par lui) — à assainir.

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


## Loki — contrat produit profil musical / Web-first (23/09/2026)
- Source de travail unique : branche `reconcile/claude-main-20260825`.
- Validation prioritaire sur Loki Web/React Native Web avant de consommer un nouveau build mobile ; reporter sur iOS/Android une fois le parcours validé, sans créer une deuxième application ni un deuxième design.
- Aucun refresh manuel ne doit être requis après une mutation : création/mise en vente d'une playlist, achat/déverrouillage, création/modification d'une soirée. L'état local doit être mis à jour immédiatement puis réconcilié avec Supabase.
- Profil propriétaire ET profil visité : la zone musique doit privilégier des dossiers/collections automatiques par style (Funk, Techno, House, Rap, etc.) plutôt qu'une longue liste de morceaux.
- Le moteur Smart Albums/Vibes trie automatiquement les morceaux par genre/style, crée les dossiers et permet au propriétaire de les renommer. Une playlist mélangée doit pouvoir être redistribuée automatiquement dans ces dossiers.
- Ouvrir un dossier gratuit lance le Swipe continu de tous ses morceaux.
- Dossier payant : cadenas + style/nom du dossier + nombre de titres + prix total. Avant achat, aucun titre, artiste ou jaquette ne doit être révélé ; uniquement préécoute audio protégée, animation Loki, court texte de découverte et bouton ACHETER.
- Après paiement confirmé : déverrouillage immédiat sans refresh, puis accès au Swipe complet et au contenu livré selon les droits marketplace.
- Une Vibe/Smart Album mise en vente ne doit jamais rester simultanément accessible gratuitement par un autre chemin du profil.
- Les agents doivent suivre ces points comme backlog durable avec statuts demandé / codé / testé / déployé / restant, et ne pas les considérer terminés sur la seule présence de code.



## App Store — publication clé en main (23/09/2026)
- **Automatisation créée** (Option 1, sans .p8) : `packages/mobile/fastlane/` (Fastfile/Appfile/Deliverfile/Gemfile + metadata fr-FR « Loki Music »), `scripts/publish-app-store.sh`, capture 6.5" (`59878944`).
- **Guide** : `docs/APP_STORE_VOCAL_GUIDE.md` — Chemin A (auto via mot de passe spécifique app) + Chemin B (manuel iPhone, 100% fiable).
- **État** : build 312 v1.0.0 déjà sur TestFlight (« Prêt à soumettre »). Non soumis — reste 1 action de 30 s (mot de passe spécifique app OU Chemin B). Lien : https://appstoreconnect.apple.com/apps/6812393589/appstore
- **Marketplace v1** : flag `playlist_marketplace` OFF (achat lien externe = rejet Apple 3.1.1). Statut : codé, non déployé (attente Apple IAP/StoreKit). Rien supprimé.
- **Audit profil vente** : préécoute protégée ✅, titres masqués ✅, anti-Shazam ✅, envie d'achat ✅. Vitrine « En vente » remontée en haut du profil (`bb89c56f`).


## Loki — design profil Styles / commerce social (24/09/2026)
- **VALIDÉ** : profil propriétaire et profil visité centrés sur des dossiers par style, longue liste secondaire seulement.
- Référence : `docs/PROFILE_STYLE_COMMERCE_REDESIGN.md`.
- Maquette : `docs/mockups/ProfileStylesMarketplace.html`.
- Audit complet Écouter/Découvertes/Playlists/Soirées/Profil/Inscription/Super Admin : `docs/audit/AUDIT_UX_FUNNEL_20260924.md`.
- Owner hero : accès direct `INVITER/PARTAGER` et `GÉRER MES VENTES`.
- Visitor : styles gratuits ouvrent Swipe ; styles payants = cadenas + quantité + prix + preview masquée.
- Rien ne disparaît : `Voir tous les morceaux` conserve la vue détaillée et toutes les actions sociales.
- Point technique à corriger : dossiers payants reliés à leur vraie offre, pas à `saleOffers[0]`.
- Statut : design poussé ; intégration code démarrée ensuite sur la branche unique.


## 2026-09-27 — Poste de commandement inter-IA
- Porte d’entrée canonique : `docs/AGENT_COMMAND_CENTER.md`.
- Configuration machine-lisible : `.github/agent-command-center.json`.
- Triage automatique : `.github/workflows/agent-command-triage.yml`.
- Premier run réel du triage : GitHub Actions run `36316053776` = **SUCCESS** sur `572a431a92b765c108ff0fa6e5c7b8e77d208d37`.
- Toute IA doit conserver la branche unique `reconcile/claude-main-20260825`, utiliser le verrou/journal existants et respecter les états LOCAL_ONLY → COMMITTED_LOCAL → PUSHED_REMOTE → TESTED_REMOTE → DEPLOYED.


## 30/09/2026 — Protection données production + Public API Toolbox
- **PUSHED_REMOTE + TESTED_REMOTE** : `8432ede5` ; Data preservation run `36781517649` = **SUCCESS**.
- `config/keep-data-preservation.json` centralise les tables critiques et ledgers append-only.
- `scripts/verify-data-preservation.cjs` bloque les opérations destructives et les modifications d'anciennes migrations ; checkout CI complet pour couvrir les push multi-commits.
- `scripts/public-api-search.mjs` permet à ChatGPT/Claude de rechercher le catalogue GitHub `public-apis/public-apis` sans ajouter de dépendance à l'application.
- Supabase KEEP est actuellement sur le **plan Free** : avant une échelle de millions d'utilisateurs, prévoir plan production, sauvegardes automatiques et PITR selon RPO/RTO.
- Point sécurité ouvert : auditer individuellement les avertissements Security Advisor sur fonctions SECURITY DEFINER exécutables par anon avant montée en charge.


## 2026-10-01 — Bibliothèque produit canonique / anti-régression
- Nouvelle source machine obligatoire : `config/keep-product-contract.json`.
- Hiérarchie de vérité : dernière décision explicite d'Adel → product contract → master spec → code/schéma live → anciens commentaires/tests.
- Profil propriétaire verrouillé : barre `PLUS | Abonnés | Reprises | FREE`; FREE juste après Reprises, jamais à côté du type Utilisateur/Créateur.
- Certification et solde FREE sont des données réelles Supabase : aucun correctif UI n'a le droit de les écrire/réinitialiser pour faire correspondre l'écran.
- Nouveau guard : `scripts/verify-product-contract.cjs` + workflow `KEEP — Product Contract Guard`.
- Toute nouvelle décision durable doit mettre à jour contrat + spec + guards dans le même changement, sinon le CI bloque.
