# KEEP — SOURCE UNIQUE POUR CLAUDE CODE ET TOUS LES AGENTS

Ce fichier est une barrière anti-confusion. Il complète `AGENTS.md` et ne crée **aucune deuxième version** du projet.

## Langue

Adel est francophone. Toute réponse, tout message, toute mise à jour à destination d'Adel doit être écrite **en français**, sans exception, y compris les messages courts, les confirmations et les résumés de fin de tâche. Ne jamais basculer en anglais au milieu d'une conversation.

## 🧭 GPS DU CODE + ERREURS À NE PLUS RÉINTRODUIRE

Avant tout code, lire obligatoirement : `docs/CODE_GPS.md`, `docs/ERROR_LEDGER.md` et `docs/INTEGRATION_CHECKLIST.md`. Le GPS indique le fichier propriétaire de chaque fonction ; le ledger conserve chaque erreur avec sa cause et sa preuve. Toute nouvelle erreur doit être enregistrée avant/dans le même commit que le fix et ne doit jamais être effacée du registre.

## 🧠 MÉMOIRE PARTAGÉE

- **Avant toute session, lire `PROJECT_STATE.md`** (racine du repo) : tableau de bord unique (état git, fonctionnalités actives, points ouverts, APIs) qui articule tous les fichiers de mémoire ci-dessous sans les dupliquer.
- Avant toute action, consulte le dossier `.context/` pour connaître l'état actuel du projet.
- Lis en priorité `.context/activeContext.md` pour savoir où on en est.
- À la fin de chaque session importante, mets à jour `.context/activeContext.md` **et** la section « Points ouverts » de `PROJECT_STATE.md` avec ce qui a été fait et ce qui reste à faire.
- Avant un commit significatif : `node scripts/update-project-state.cjs` (régénère les sections git de `PROJECT_STATE.md`).
- **Configuration une fois par clone** (hooks Git non versionnés par défaut dans `.git/hooks`) : `git config core.hooksPath .githooks` — active un rappel pre-commit non bloquant + une resynchronisation automatique post-merge de `PROJECT_STATE.md`.

Cette mémoire facilite la continuité entre agents. Le code, le schéma Supabase réel, `CLAUDE.md` et `AGENTS.md` restent les sources de vérité en cas d'écart.

## Projet officiel

- Repository unique : `adelkhatra-bit/KEEP`
- Branche de travail unique : `reconcile/claude-main-20260825`
- Application mobile/web : `packages/mobile`
- Super Admin : `packages/admin`
- Backend : `packages/backend`
- Moteur musique : `packages/music`
- Base/Auth/Storage : projet Supabase `rrhqsqzcplvmwxizqnla`
- Lanceur local unique : `START_KEEP_LIVE_CLEAN.bat`

Ne jamais travailler dans un autre clone, un ancien dossier `apps/`, `main`, une ancienne branche Claude, un ancien HTML exporté ou une URL localhost quand la tâche concerne la version publique.

## URLs publiques canoniques — ne plus les changer

- KEEP : `https://adelkhatra-bit.github.io/KEEP/`
- Profil partagé : `https://adelkhatra-bit.github.io/KEEP/share-profile/?u=<username>`
- Super Admin : `https://adelkhatra-bit.github.io/KEEP/admin-preview/`
- Alias Super Admin : `https://adelkhatra-bit.github.io/KEEP/superadmin/`
- Auth e-mail — destination publique : `https://adelkhatra-bit.github.io/KEEP/`

Aucun code de production ne doit générer `localhost`, `/KEEP/KEEP`, une URL de preview temporaire ou un autre domaine pour ces fonctions.

### Anciens liens : redirection uniquement, jamais une deuxième application

Les anciennes fonctions Supabase `keep-public`, `keep-preview` et `keep-admin-preview` existent seulement comme **ponts de compatibilité** pour des liens déjà envoyés. Elles doivent répondre par redirection HTTP 308 vers les URLs canoniques ci-dessus. Elles ne doivent jamais servir un bundle, lire une branche `web-preview`, contenir une interface parallèle, un mot de passe de démo ou une logique Super Admin propre.

Les branches `web-preview`, `admin-preview`, `chatgpt/keep-design-integration-audit`, `chatgpt/qa-human-smoke`, `claude-local-backup-20260825` et `backup/pre-codex-takeover-20260826` sont des archives/références de récupération, pas des sources de déploiement. Une IA ne doit jamais y pousser une correction destinée à l'application active.

Toute nouvelle intégration, tout nouveau test et tout nouveau lien de partage doivent pointer vers `reconcile/claude-main-20260825` et vers le domaine GitHub Pages canonique. Si un ancien lien ressort, on corrige/redirige l'ancien lien ; on ne crée jamais un nouveau domaine.

## Routage web / GitHub Pages

GitHub Pages n'effectue pas de rewrite SPA côté serveur. La solution officielle KEEP est donc **déjà** dans `.github/workflows/web-preview-pages.yml` :

1. export Expo unique ;
2. copie d'un shell `index.html` pour les routes statiques connues ;
3. `404.html` qui renvoie les routes dynamiques vers `/KEEP/?__keep_route=...` ;
4. restauration de la route côté navigateur avant le démarrage React Navigation ;
5. tests réels Chromium / Android / WebKit iPhone / Firefox, chargement + refresh.

`web-preview-pages.yml` est le **seul workflow autorisé à publier le site public** depuis cette branche. Ne jamais recréer ou réintroduire `web-public-from-reconcile.yml`, un second deploy Pages, un site Vercel parallèle ou un HTML d'application concurrent. Si le site public est faux, corriger la chaîne unique existante au lieu d'en publier une autre.

Ne jamais créer un deuxième site mobile, un deuxième bundle ou une seconde page d'application pour « corriger » un 404. Corriger la route dans cette chaîne unique.

## Moteurs de navigateur et moteurs de recherche

- Toute correction web critique doit être testée au minimum sur Chromium desktop, Firefox desktop, Chromium mobile Android et WebKit iPhone.
- Le shell public KEEP garde une URL canonique unique `https://adelkhatra-bit.github.io/KEEP/` et un sitemap généré pendant l'export.
- Un profil public partagé garde sa propre canonical `https://adelkhatra-bit.github.io/KEEP/share-profile/?u=<username>`.
- Ne jamais indexer une URL localhost, une preview temporaire ou un doublon `/KEEP/KEEP`.
- Les métadonnées SEO ne doivent jamais modifier le rendu ou le design React Native.

## Design verrouillé

Sans demande explicite d'Adel, ne pas modifier :

- le responsive visuel de `packages/mobile/App.tsx` ;
- `packages/mobile/src/navigation/Navigation.tsx` ;
- la barre des 5 onglets ;
- le design validé des écrans existants.

Une correction de logique ne doit pas devenir une refonte graphique.

## Identité et partage

- Un pseudo KEEP est unique sans tenir compte des majuscules/minuscules (`profiles_username_lower_key`).
- Le profil public partagé utilise toujours `/share-profile/?u=<username>`.
- Le bouton Suivre du profil partagé dirige vers la route KEEP canonique ; pas vers une ancienne page.
- Sans compte, `+ Suivre` ouvre directement la création de compte KEEP et conserve l'intention de suivre le profil cible après connexion/création.
- Le partage par e-mail du profil ouvre **la boîte e-mail de l'utilisateur** avec un brouillon prérempli. KEEP n'envoie pas cet e-mail de partage via Brevo/Supabase.
- L'e-mail d'authentification est un flux séparé et ne doit jamais contenir le lien public d'un autre utilisateur à la place du lien de connexion.

## Essai gratuit / compte

- L'essai gratuit ne doit jamais créer des dizaines d'utilisateurs Supabase au refresh.
- Le mode invité local est stable sur l'appareil et limité aux fonctions prévues pour l'essai.
- Une conversion vers un compte réel doit préserver le profil préparé et l'historique local ; ne jamais remplacer silencieusement les données de l'utilisateur.
- Depuis le 01/09/2026, la création de compte exige pseudo + mot de passe + e-mail vérifié (les trois obligatoires), pour que « mot de passe oublié » fonctionne toujours. La connexion continue d'accepter pseudo OU e-mail, pour ne jamais casser les anciens comptes créés avant cette date sans e-mail.
- Les fonctions sociales qui écrivent en base (suivre, liker, etc.) doivent à terme exiger une identité authentifiée permanente ou afficher clairement qu'une connexion est nécessaire.

## Profil créateur / formules

- L'`ESPACE CRÉATEUR` doit être visible de façon cohérente sur ordinateur, Android et iPhone, y compris lorsqu'une fonction est verrouillée.
- `Utilisateur` reste gratuit.
- DJ / Artiste / Créateur / Producteur et création d'événement exigent `CREATOR_PRO`.
- Lieu / établissement exige `VENUE_PRO`.
- Un clic sur une fonction verrouillée doit ouvrir `Offers` directement sur **la formule exacte requise**, avec le badge `FORMULE REQUISE`; ne pas afficher une impasse ou un bouton sans destination.
- Tant que le paiement n'est pas réellement câblé, ne jamais prétendre que le CTA d'achat encaisse ou active un abonnement.

## Stratégie OTA (eas update) — réduire les coûts EAS

L'objectif est de **ne consommer un build EAS que quand c'est indispensable**. La majorité des refontes Loki Music sont du JS/TS pur et se livrent en OTA (0 build EAS consommé).

Le workflow `.github/workflows/eas-update-production.yml` publie automatiquement en OTA sur `production` à chaque push sur `reconcile/claude-main-20260825` qui touche `packages/mobile/**`, `packages/music/**` ou les dépendances JS (`package.json` / `package-lock.json`). Secret requis dans GitHub : `EXPO_TOKEN`. Le `runtimeVersion.policy` est `appVersion` : un OTA n'est délivré qu'aux binaires dont la version applicative correspond.

### Livraison OTA — `eas update` (0 build EAS)
Toute modif **purement JavaScript/TypeScript** embarquée dans le bundle :
- composants et écrans React (`.tsx`), styles, `colors.ts`, logique métier ;
- textes, wording, traductions ;
- assets JS chargés au runtime (images du bundle, `assets/**`) ;
- correctifs de bugs JS, refontes visuelles sans nouvelle dépendance native.

### Build natif obligatoire — `eas build` (consomme un build)
Dès qu'on touche à la couche native, l'OTA ne suffit pas :
- ajout/màj d'une **dépendance native** (module avec code natif, config plugin) ;
- changement de `app.json` impactant le natif : permissions, plugins, `bundleIdentifier`/`package`, icônes/splash natifs, `newArchEnabled`, entitlements ;
- montée de version du **SDK Expo** ou de `runtimeVersion` ;
- toute modif nécessitant une recompilation iOS/Android.

### Règle de décision rapide
« Est-ce que ça marcherait en rechargeant seulement le bundle JS sur le binaire déjà installé ? »
- Oui → OTA (`eas update`).
- Non (besoin de recompiler) → build natif (`eas build`) puis nouvelle soumission TestFlight/Store.

## Avant chaque push

Exécuter/laisser passer au minimum :

1. `node scripts/verify-source-of-truth.cjs`
2. typecheck du/des workspace(s) touché(s)
3. build/export réel si code web/mobile touché
4. tests navigateur réels, pas seulement une lecture statique du code
5. pour les routes publiques : test direct + refresh et absence de page blanche

Si un test échoue, ne pas annoncer PASS.

## JEV (TypeSafe AI) — décisions binaires/simples à bas coût

Un juge auxiliaire (plugin `typesafe@jev`, marketplace `gecm0/jev-judge-mcp`,
installé au niveau du compte Claude Code) répond par jugement typé
(oui/non, score, sélection) au lieu de générer du texte -- très bon marché
par rapport à un tour de raisonnement complet. Il **envoie les données
fournies à `api.typesafe.ai`** (service tiers) : jamais de secret/clé, et
réfléchir avant d'y passer du code propriétaire sensible.

- **Utiliser** (outil `judge` du MCP) : validations binaires courtes,
  classification, score de confiance, choix entre options déjà énumérées,
  garde-fous avant une action (ex. "cette réponse contredit-elle un fait
  déjà établi dans la conversation ?"). Toujours un jugement TYPÉ sur du
  texte/JSON déjà en main -- jamais une génération.
- **Ne jamais utiliser** pour : lire un fichier, écrire/modifier du code,
  générer du texte explicatif, une réponse destinée à Adel. JEV ne fait
  aucune de ces choses.
- **Repli obligatoire** : si l'outil `judge` n'apparaît pas dans les outils
  disponibles de la session (le plugin peut demander un redémarrage de
  session pour s'enregistrer), continuer normalement sans lui -- ne jamais
  bloquer une tâche en attendant JEV.

## Coordination IA

Avant modification, lire :

1. `CLAUDE.md`
2. `AGENTS.md`
3. les derniers messages de `AGENT_MESSAGES.md`
4. `AI/AI_INSTRUCTIONS.md` pour les instructions arrivées par le relais ChatGPT ↔ Claude Code
5. `AI/AI_REPORT.md` pour l'état du dernier relais Claude → ChatGPT

Le relais canonique est `keep-ai-relay` + `public.ai_relay_messages`. Ne créer aucun second canal IA et ne recopier aucun secret dans le dépôt. Après une étape notable pilotée par le relais, mettre à jour `AI/AI_REPORT.md` et le journal partagé.

Utiliser `scripts/agent-lock.cjs` avant de toucher les mêmes fichiers qu'un autre agent. Une IA ne doit jamais supposer le nom d'une table, d'une route ou d'une branche : vérifier le dépôt et le schéma réel.

La source de vérité est le code de cette branche + le schéma Supabase réel + les preuves CI de cette branche. Jamais une ancienne conversation, une ancienne capture, un ancien déploiement ou un ancien dossier.
