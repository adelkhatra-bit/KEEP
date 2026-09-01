# KEEP — SOURCE UNIQUE POUR CLAUDE CODE ET TOUS LES AGENTS

Ce fichier est une barrière anti-confusion. Il complète `AGENTS.md` et ne crée **aucune deuxième version** du projet.

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

## Avant chaque push

Exécuter/laisser passer au minimum :

1. `node scripts/verify-source-of-truth.cjs`
2. typecheck du/des workspace(s) touché(s)
3. build/export réel si code web/mobile touché
4. tests navigateur réels, pas seulement une lecture statique du code
5. pour les routes publiques : test direct + refresh et absence de page blanche

Si un test échoue, ne pas annoncer PASS.

## Coordination IA

Avant modification, lire :

1. `CLAUDE.md`
2. `AGENTS.md`
3. les derniers messages de `AGENT_MESSAGES.md`

Utiliser `scripts/agent-lock.cjs` avant de toucher les mêmes fichiers qu'un autre agent. Une IA ne doit jamais supposer le nom d'une table, d'une route ou d'une branche : vérifier le dépôt et le schéma réel.

La source de vérité est le code de cette branche + le schéma Supabase réel + les preuves CI de cette branche. Jamais une ancienne conversation, une ancienne capture, un ancien déploiement ou un ancien dossier.
