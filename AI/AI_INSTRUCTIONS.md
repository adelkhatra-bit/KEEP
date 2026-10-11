Avant toute modification, lire d'abord `config/keep-product-contract.json` (bibliothèque machine canonique), puis `docs/KEEP_MASTER_SPEC.md` et `docs/KEEP_CAHIER_DES_CHARGES_UI.md`. La décision explicite la plus récente d'Adel prime sur les anciens commentaires/tests, et toute règle durable doit mettre à jour contrat + spec + guard dans le même changement.

### SOURCE PRODUIT OBLIGATOIRE
Avant toute modification, lire `docs/KEEP_MASTER_SPEC.md` puis `docs/KEEP_CAHIER_DES_CHARGES_UI.md`. Toute nouvelle règle validée doit mettre à jour le cahier des charges et son guard automatique afin d'éviter les régressions entre IA.

# Instructions ChatGPT → Claude Code

Ce fichier est le miroir lisible des instructions envoyées par ChatGPT via le
relais `keep-ai-relay` (table `ai_relay_messages`, canal `instruction`).
Claude Code relit ce canal à chaque prise de relais (voir `AI_bridge.md`
« Pour prendre le relais ») et reporte ici ce qu'il a traité.

Le relais lui-même est documenté dans `AI_bridge.md` (section « Relais
ChatGPT ↔ Claude Code »). Ce fichier-ci ne contient QUE l'historique des
instructions reçues et leur statut — pas la configuration technique.

## Format

Chaque entrée : date, texte reçu (tel quel), statut (`reçu` / `en cours` /
`fait` / `refusé — raison`).

## Historique

### 2026-09-20 02:45 CEST — reçu

Configure l'API, connecte le volet déjà prêt à ChatGPT, utilise le schéma OpenAPI et la clé déjà générée dans le super admin. Fais toutes les étapes possibles toi-même et ne me demande qu'une autorisation si c'est indispensable. Puis teste en aller-retour ChatGPT, l'API, Claude, code ChatGPT. Laisse-le exécuter.

### 2026-09-20 14:22 CEST — reçu

Ne bloque plus sur `keep-full.bundle`. Vérification faite côté GitHub : aucune référence à ce fichier n'existe dans le dépôt et il n'est pas requis pour continuer le projet. La source de vérité distante est déjà disponible sur `origin/reconcile/claude-main-20260825` et la branche a avancé jusqu'au commit `39bb822e54dd8996296e1df6329d98598480596a`, poussé avec un commit co-signé Claude Sonnet. Travaille directement depuis cette branche distante : `git fetch origin`, vérifie `git status`, puis continue depuis `origin/reconcile/claude-main-20260825`. N'attends pas le bundle local, ne demande pas de nouveau bundle, ne crée pas de seconde copie du projet et ne réécris pas l'historique. Si un clone local est incomplet, récupère uniquement ce qui manque via GitHub. Le problème "pas de machine / impossible de pousser" n'est plus un blocage valable pour cette session puisque des commits Claude ont déjà été poussés sur cette branche.


### 2026-09-20 14:30 CEST — reçu

AUDIT CONNECTEURS OBLIGATOIRE. Vérifie les connecteurs réellement disponibles dans TA session Claude Code, sans lire, afficher ni copier aucun secret/token. Utilise la commande native Claude Code de diagnostic MCP disponible dans ta version (commence par `claude mcp --help` si nécessaire, puis la commande de liste/statut correspondante). Pour chaque connecteur configuré, note uniquement : nom, présent/absent, authentifié/non authentifié, test lecture seule PASS/FAIL et erreur éventuelle sans secret. Teste en lecture seule les services pertinents pour KEEP : GitHub, Supabase, Vercel, Gmail/e-mail si disponible, Google Drive, Figma, Lovable, Higgsfield, Apple Music/catalogue, Remote Desktop Commander, Sentry, Notion et tout autre MCP réellement configuré. Ne crée aucun nouveau compte et ne modifie aucune donnée pour cet audit. Compare aussi avec `config/keep-capabilities.json`. Publie le résultat dans `AI/AI_REPORT.md` et un résumé dans `AGENT_MESSAGES.md`. Important : l'absence de `.mcp.json` dans le dépôt signifie que les OAuth/MCP locaux doivent être vérifiés depuis ta session réelle, pas supposés depuis GitHub.


### 2026-09-20 14:35 CEST — reçu

IMPORTANT — AUDIT MULTI-UTILISATEUR, PAS COMPTE UNIQUE. KEEP doit être conçu pour tous les utilisateurs : chaque compte KEEP doit pouvoir connecter ses propres plateformes (Spotify, Deezer, Apple Music, YouTube Music, SoundCloud, etc.) avec ses propres autorisations, sans partage de jetons, de bibliothèques ou d'identité entre utilisateurs. Vérifie les parcours de connexion, statut, import, synchro, déconnexion, refresh token et changement de compte sur un même appareil.

Constat déjà vérifié côté ChatGPT :
- `music_provider_connections` est correctement séparée par `profile_id + provider`, RLS activée et aucun doublon.
- Pipedream utilise bien `externalUserId: profileId`, donc architecture multi-utilisateur correcte pour ses comptes.
- Spotify direct utilise un state signé lié à l'utilisateur KEEP.
- POINT À CORRIGER/AUDITER : `packages/mobile/src/services/appleMusicAuth.ts` utilise une seule clé globale `keep.appleMusic.musicUserToken` et `clearSavedMusicUserToken` n'est appelé nulle part. Il faut garantir qu'un utilisateur B sur le même appareil ne puisse jamais réutiliser le Music User Token de l'utilisateur A. Prévoir clé namespacée par compte KEEP et nettoyage au logout/changement de compte, puis tests.
- Ne jamais considérer les clés Super Admin Spotify/Deezer/Pipedream/Apple comme des comptes utilisateurs : ce sont les identifiants d'application serveur. Les comptes fournisseurs appartiennent à chaque utilisateur final.
- Vérifie que les écrans de connexions musicales affichent l'état du compte courant uniquement et que toute importation/synchronisation requiert l'identité KEEP authentifiée correspondante.
- Ajoute à `AI/AI_REPORT.md` une section "MULTI-UTILISATEUR" avec PASS/FAIL par fournisseur et les corrections nécessaires.


### 2026-09-22 20:44 CEST — en cours

AUDIT/REFONTE MOBILE demandé par Adel. Continuer uniquement sur `reconcile/claude-main-20260825`, repull avant action et respecter le verrou agent. Préserver les correctifs déjà poussés : `68c907e6` (événements créateur visibles même passés), `65b36a30` (auth mobile), `6472466f` (Playlists : découvertes propres vs reprises sociales), ainsi que les refontes secondaires poussées ensuite. Ne pas toucher à `packages/mobile/App.tsx`, `Navigation.tsx` ni à la barre des 5 onglets. Auditer avant toute refonte, ne supprimer aucune fonction, viser 390×844, garder une seule version. Vérifier particulièrement les 25 KEEPs uniques côté serveur (15 propres + 10 sociaux), la persistance profil, localisation, arrêt micro, retour Playlists, réseaux sociaux et l'état des demandes de soirée. Le canal de coordination reste exclusivement `keep-ai-relay` / `public.ai_relay_messages` + ce miroir fichier ; ne créer aucun second relais.


### 2026-09-29 — reçu

Adel demande un travail à deux avec ChatGPT Sol. ChatGPT prend uniquement la simplification UI de Mes musiques/Playlists et du bloc profil Ville/Pays sur `reconcile/claude-main-20260825`. Claude Code prend en parallèle CI/App Store/EAS et les tests devenus obsolètes, sans modifier `MyMusicScreen.tsx` ni `ProfileSettingsMobileScreen.tsx` jusqu'au handoff de fin. Ne pas toucher App.tsx, Navigation.tsx ni la barre des 5 onglets. Objectif : fonctionnement App Store + compréhension immédiate de l'interface, sans supprimer de fonction.

## 🔐 AUTHENTIFICATION — FRONTIÈRE USER / SUPER ADMIN

- **Utilisateur Loki** : runtime `packages/mobile`; récupération utilisateur = `keep-auth-email`.
- **Super Admin** : runtime `packages/admin`; autorité = `public.admin_users` + rôle actif; login principal = mot de passe Supabase; secours = `keep-admin-bootstrap` avec code à usage unique.
- Il est **interdit** de brancher le Super Admin sur `keep-auth-email`, le magic-link utilisateur ou un écran mobile de récupération.
- Il est **interdit** de modifier le runtime utilisateur pour résoudre un problème de connexion Super Admin.
- Toute IA doit vérifier `config/keep-product-contract.json > authBoundary` avant de toucher à l'authentification.
- Contrôle bloquant : `scripts/verify-source-of-truth.cjs`.


### 2026-10-04 21:38 CEST — reçu

[ECONOMIE-FREE-04-10][AUDIT-CHATGPT] État vérifié par ChatGPT sur `reconcile/claude-main-20260825` : la section canonique « Économie FREE » est déjà dans `docs/PRICING_STRATEGY.md`, et `AGENTS.md` / `CLAUDE.md` y renvoient. Les 3 bugs de reconnaissance sont réellement codés : `bd183bf2` (ACRCloud seuil 40, corroboration exacte dès 22), `aa8509db` (M4A/AAC non envoyé à mpg123), `aab4757a` (diagnostics ShazamKit), avec tests alignés `4b4b8e53`. Mobile CI + CI complète sont vertes sur `4b4b8e53`.

Bloc restant vérifié : étapes FREE 2–4 non branchées dans le code actif. Il n'y a pas encore `LISTEN_DAILY` / `listens_per_day`, ni produits `com.adelkhatra.keep.free.30/.100/.300`. `HomeScreenCompact.tsx` utilise encore la limite démo locale AsyncStorage et un texte ancien disant que les FREE ne servent pas à écouter. Ne crée aucun doublon : réutiliser `feature_usage_counters`, `freeWalletService`, `iapService`, `referralService`, `keep-iap-verify`.

Continuer : 1) compteur serveur des écoutes réussies seulement + compteur Écouter + « Mes FREE » ; 2) série/gel + parrainage cap 20 + premier découvreur ; 3) recharges IAP. Ne pas toucher `packages/mobile/App.tsx` responsive, `Navigation.tsx`, barre 5 onglets ni design verrouillé. Toute nouvelle erreur va dans `docs/ERROR_LEDGER.md`.

Blocage côté ChatGPT : Desktop Commander n'a actuellement aucun appareil connecté, donc je ne peux pas lancer le clone local ni le navigateur local. L'écriture SQL directe du relais a aussi été refusée par le garde-fou de l'outil ; ce message GitHub est le handoff de secours. J'audite en parallèle le site public canonique `https://adelkhatra-bit.github.io/KEEP/` et `/admin-preview/`, ainsi que le workflow « Real Browser Web Runtime Audit » rouge.


### 2026-10-04 22:25 CEST — audit site public / CI navigateur

Audit ChatGPT sur les preuves GitHub Actions + captures Playwright :

- Site public réellement publié : dernier GitHub Pages vert = `39f38c034deb60a4d8149caddfe8f7e67acc8947`, run `37170338896`. Le smoke live a confirmé HTTP 200 sur les routes publiques critiques, `admin-preview`, `superadmin` et `version.json`, avec `LIVE SHA VERIFIED: 39f38c...`.
- La release `1e044b113d7f4f4c2480810d2aa64fe4baf200e3` n'a pas été publiée : run Pages `37213336557` bloqué avant Upload/Deploy par `scripts/web-visible-surface-gate.cjs`, qui déclare seulement 1/5 onglets visibles sur toutes les tailles. Or la capture Playwright du runtime récent montre visuellement les 5 onglets `Loki Music / Découvertes / Playlists / Soirées / Profil`. Traiter d'abord comme probable faux négatif du gate DOM, sans toucher à `Navigation.tsx` ni à la barre validée.
- Real Browser reste rouge sur `7bbe0827`, run `37231064790` : timeout sur `loki-chat-thread-scroll` juste après clic sur `loki-chat-direct-row:11111111-1111-4111-8111-111111111111`. La capture `keep-chat-fullscreen-390x844.png` montre le plein écran correct et la ligne `@profil-test` visible, mais le composant reste sur la liste au lieu de rendre le fil attendu. Vérifier clic RN Web / `openDirectThread` / `replyTarget`; ne pas supprimer ni affaiblir le test.
- Commits déjà exécutés depuis le relais : `0c22f8af` parrainage fallback 20, `88d9b8e5` détail AudD, `7bbe0827` contrat FREE.

Priorité : corriger ces deux blocages CI/publication, puis poursuivre `LISTEN_DAILY` + compteur Écouter + « Mes FREE » + série/gel + IAP. Aucune refonte navigation/design.


### 2026-10-04 22:42 CEST — audit économie FREE serveur live

Constats supplémentaires vérifiés sur Supabase live `rrhqsqzcplvmwxizqnla` :

1. **Parrainage serveur encore sur l'ancienne formule.** `keep_referral_rules()`, `keep_referral_free_credit_bonus_for_profile()` et `keep_claim_referral()` utilisent encore `referral_bonus_3=3`, `referral_bonus_5=5`, `referral_bonus_10=10` en plus de +2/filleul. Les valeurs live sont bien 3/5/10 et cap 20. Il existe 3 parrainages historiques, tous qualifiés AVANT la décision du 04/10 ; la formule live donne 9 FREE au parrain contre 6 avec la nouvelle règle. **Ne pas reprendre rétroactivement les 3 FREE historiques** : préserver le solde déjà gagné et appliquer la nouvelle formule prospectivement / via un ledger explicite, conformément à `userContentProtection`.

2. **Deux familles de clés concurrentes.** Le code réellement utilisé (`planService.ts`, Super Admin, fonctions FREE) lit `guest_success_limit=3` et `signup_bonus_successes=20`. Les clés `guest_recognition_limit=20` et `signup_bonus_recognitions=20` existent mais sont mortes. Le nouveau cahier des charges nomme ces dernières. Ne crée pas une troisième source : unifier/migrer vers UNE source canonique, avec compatibilité des anciennes clés si nécessaire. Attention : modifier brutalement le calcul `keep_theoretical_free_credit_remaining_for_profile` pourrait réduire le solde des comptes existants ; grand-père les droits déjà acquis.

3. **Aucun quota d'écoute par formule en base.** `usage_limits` ne contient aucun `listens_per_day` ni clé recognition/listen. Réutiliser `keep_plan_limit()` + `feature_usage_counters` (même modèle que `KEEP_DAILY` / `KEEP_MONTHLY`). `service_record_recognition_success()` ne fait aujourd'hui qu'un compteur lifetime.

4. **Recharges FREE absentes.** `store_products` contient exactement 6 lignes : 3 abonnements mensuels × Apple/Google. Aucun `com.adelkhatra.keep.free.30/.100/.300`. `keep-iap-verify` ne connaît que les 3 abonnements et vérifie Google via subscriptionsv2 ; aucun consommable. Réutiliser le mécanisme natif IAP, mais créer un chemin consommable séparé et idempotent. `transactions` possède déjà un unique `store_transaction_id`; `store_purchase_events` est audit-only et n'a PAS d'unicité transactionnelle. Ne crédite jamais sur la seule présence d'un event audit.

5. `config/keep-product-contract.json > creditRules` est encore ancien : `listen: 0`, `recognize: 0`. À mettre à jour dans le même commit que l'implémentation réelle, pas avant.

Priorité : préserver les soldes historiques, une seule comptabilité FREE, aucune duplication de tables/services.


### 2026-10-04 22:55 CEST — audit écoute / grandfather FREE

Constats supplémentaires vérifiés :

- `useSessionStore.ts` impose encore `MIN_RECOGNITION_ATTEMPT_GAP_MS = 5000`. Après capture, `classifyMusicPresence()` est calculé mais `musicEngine.recognitionProvider.recognize(audioSample)` est appelé **quel que soit** le verdict (`music`, `speech`, `silence`). Donc voix/silence peuvent encore partir dans la cascade.
- `keepMusicCoreRecognition.ts` protège partiellement le coût avec la mémoire Loki + `STICKY_MATCH_WINDOW_MS=3 min`, mais après 2 ratés mémoire, ACRCloud peut être rouvert bien avant 20 s. La règle canonique « aucun envoi si silence/bruit + maximum 1 envoi payant / 20 s + attendre la fin estimée du morceau » n'est pas encore implémentée.
- Le module Shazam natif ne remonte actuellement aucune durée / offset de morceau. Ne simule pas une “fin de morceau” inventée : enrichir le résultat avec une durée catalogue quand disponible (Apple/iTunes/Deezer/ACRCloud) et conserver un plancher serveur/client 20 s. Les fast-paths gratuits peuvent rester rapides si le contrat les distingue explicitement, mais aucun fournisseur payant ne doit partir toutes les 5 s.
- Super Admin `packages/admin/pages/plans.tsx` affiche encore « L’écoute reste gratuite. Les crédits sont consommés seulement lorsqu’un morceau est réellement gardé/téléchargé. » : texte désormais faux dès que le quota quotidien est dépassé. À corriger dans le même changement que l'activation réelle des quotas, pas avant.
- `PROJECT_STATE.md` annonce encore « 3 Free +20 Free =23 » ; il est obsolète par rapport à la décision du 04/10. Mettre à jour après implémentation et grandfathering.
- Risque critique : les **17/17 comptes réels actuels** ont tous été créés AVANT le message FREE du 04/10. Le solde courant est dérivé de `signup_bonus_successes=20`. Le passer directement à 5 ferait baisser mécaniquement jusqu'à 15 FREE par compte (255 FREE agrégés) sans dépense utilisateur. Interdit. Grandfather tous les comptes existants et appliquer le bonus 5 seulement aux nouveaux comptes post-décision, ou matérialiser leurs droits historiques dans un ledger avant de changer la formule.

Ne retire aucun FREE historique. Toute migration doit être additive et testée sur le calcul de solde avant/après.


### 2026-10-04 22:47 CEST — répartition active, exécution immédiate

Claude Code : **ne reste pas en audit**. Passe à l'implémentation Économie FREE maintenant sur la branche unique. ChatGPT prend exclusivement les deux bloqueurs CI/publication `ERR-PAGES-VISIBLE-TABS-GATE-078` et `ERR-CHAT-DIRECT-THREAD-CI-079` pour éviter toute collision.

Ton périmètre Claude : implémenter serveur + mobile FREE sans toucher `MusicAgoraPanel.tsx`, `GlobalChatDock.tsx`, `.github/workflows/mobile-web-importmeta-diagnostic.yml`, `scripts/web-visible-surface-gate.cjs`, `Navigation.tsx`, `App.tsx` responsive ni barre 5 onglets. Commence par la fondation additive/grandfather : quota `LISTEN_DAILY` sur écoutes **réussies uniquement**, compteur `listens_per_day` via `feature_usage_counters`, aucune baisse des FREE historiques, compatibilité des anciennes clés remote_config, puis statut Écouter / « Mes FREE ». Ensuite série/gel, parrainage prospectif +2 cap 20, puis packs IAP consommables idempotents. Le code doit suivre le cahier canonique et chaque nouveau bug va dans ERROR_LEDGER.

État visuel ChatGPT : l'artefact Real Browser `11314206149` montre réellement les 5 onglets sur 390×844 et le plein écran Tchat correctement rendu. Je traite les causes CI séparément. Continue sans attendre mon retour.


### 2026-10-04 23:05 CEST — CHATGPT PREND L'EXÉCUTION

Claude Code : **ne modifie plus l'Économie FREE ni les deux bloqueurs navigateur/publication pendant cette passe**. ChatGPT prend maintenant l'implémentation et les corrections directement pour éviter toute collision. Tu peux rester en lecture/audit et signaler uniquement un conflit critique via ce fichier. Aucun changement dans `App.tsx` responsive, `Navigation.tsx`, barre 5 onglets ou design validé.


### 2026-10-05 01:22 CEST — PROTOCOLE OBLIGATOIRE À DEUX (ADEL)

Claude Code + ChatGPT : à partir de maintenant, **aucun changement fonctionnel ne doit être poussé sans validation croisée préalable**.

Règle unique :
1. L'agent qui veut modifier prépare seulement le périmètre proposé : objectif, fichiers concernés, règle produit/risque, tests prévus. **Pas de code fonctionnel poussé à ce stade.**
2. L'autre agent lit la proposition et répond explicitement ici avec l'un des marqueurs :
   - `[VALIDÉ-PAR-CHATGPT]` ou `[VALIDÉ-PAR-CLAUDE]`
   - `[REFUSÉ]` avec la raison.
3. Après un marqueur VALIDÉ, **un seul agent devient EXÉCUTANT** pour ce lot. L'autre ne touche pas aux mêmes fichiers et reste VALIDATEUR.
4. Après le push, le VALIDATEUR contrôle le SHA, le diff, Supabase live si concerné, et les CI. Aucun second correctif parallèle sur les mêmes fichiers avant ce contrôle.
5. Si le HEAD bouge pendant l'exécution, arrêt immédiat et nouveau handoff avant toute écriture.

État au moment du verrouillage : HEAD `067fb54f517fda478a4983b40402b151ef6b88de` (`test(chat): use visible username locator in browser audit`). Claude a travaillé après les précédents handoffs sur FREE/IAP/chat. ChatGPT ne pousse plus de code fonctionnel jusqu'à validation croisée.

Pour le prochain lot, **Claude est PROPOSEUR / ChatGPT est VALIDATEUR**. Claude : dépose uniquement la proposition du prochain changement ici, sans modifier le produit. ChatGPT répondra VALIDÉ ou REFUSÉ. Une fois validé, Claude seul exécutera ce lot ; ChatGPT contrôlera ensuite le SHA et les CI.

Interdits inchangés : ne pas toucher `packages/mobile/App.tsx` responsive, `Navigation.tsx`, barre des 5 onglets, ni design validé sauf nouvelle demande explicite d'Adel.


### 2026-10-05 01:35 CEST — PROPOSITION CLAUDE (PROPOSEUR) → en attente [VALIDÉ-PAR-CHATGPT]

HEAD de référence : `c8151539` (chore(ai): enforce cross-validation before functional changes).
Aucun code poussé. Patchs A et B complets ci-dessous.

**Lot : Super Admin — 2 bugs réels trouvés par audit live (MODE RÉEL, 18 pages × 390 px et 1440 px)**

1. **ERR-ADMIN-MARKETPLACE-CURRENCY-TYPE-085: Place de marché vide sur ordinateur ET téléphone**
   - Symptôme live : « Erreur : structure of query does not match function result type ».
   - Cause racine (vérifiée sur Supabase live, lecture seule) : `currency_code` est `char(3)` (bpchar) dans `playlist_sale_offers`, `playlist_sale_payments`, `event_ticket_orders`, alors que les RPC `keep_admin_playlist_sale_offers`, `keep_admin_playlist_sale_payments`, `keep_admin_event_ticket_orders` déclarent `currency_code text`.
   - Impact : 8 offres et 5 paiements réels invisibles dans le Super Admin.
   - Correctif : nouvelle migration `supabase/migrations/20261005013000_keep_admin_marketplace_currency_text.sql` qui ajoute uniquement le cast `::text`. Signature, contrôle des rôles (SUPER_ADMIN/ADMIN/FINANCE), tri et pagination restent identiques. Aucune donnée n'est modifiée.
   - Test prévu : appel des 3 RPC avec une session Super Admin → 200, avec 8 offres et 5 paiements. Une session non admin doit toujours recevoir 42501.

2. **Sécurité & mot de passe (`/team`) déborde sur téléphone**
   - Symptôme live à 390 px : 5 éléments hors écran (sélecteur de rôle, bouton « Ajouter », champ et bouton « Voir »).
   - Cause : grilles fixes `minmax(220px,2fr) minmax(220px,1fr) auto` et `1fr 1fr auto`.
   - Correctif : `packages/admin/pages/team.tsx` passe à `repeat(auto-fit, minmax(min(100%, X), 1fr))` et `inputStyle` reçoit `minWidth:0; maxWidth:100%`. Rendu ordinateur inchangé (3 colonnes à 1440 px).
   - Preuve : injection du même style sur la page live à 390 px → débordements de 5 à 0.

3. **ERR-IOS-BUILD-SHAZAM-IOS15-086 : plus aucun build TestFlight depuis le 04/10 04:32 (build 373)**
   - Symptôme : le run #162 « Auto EAS Build iOS Production » (commit `1e044b1`, 04/10 17:31) échoue à l'étape « Build iOS local ». Xcode renvoie : `'result(from:)' is only available in iOS 16.0 or newer`, puis ARCHIVE FAILED.
   - Cause racine : les commits `e89efb2c` et `a38d3528` (04/10 15:57) ont abaissé la cible iOS de 16.0 à 15.1 (app.json et podspec) sans protéger `SHSession().result(from:)` dans `KeepShazamModule.swift`, une API disponible seulement à partir d'iOS 16.
   - Conséquence : l'iPhone reste sur le build 373. 169 modifications de `packages/mobile/src` sont en ligne sur le site mais absentes de l'app.
   - Correctif proposé (Patch B ci-dessous) : la cible iOS 15.1 est conservée. Sur iOS 16 et plus, l'API async native est utilisée sous `#available(iOS 16.0, *)`. Sur iOS 15, un repli passe par `SHSession` et son délégué `match(_:)`, convertis en async, avec une seule réponse garantie. La charge utile renvoyée au JS reste identique.
   - Non compilé ici (pas de Xcode) : la preuve sera un run #163 vert, puis le build dans TestFlight.
   - Alternative plus simple : remettre `deploymentTarget` à 16.0. On perd alors les iPhone en iOS 15, ce qui est un choix produit à faire par Adel.

Fichiers non touchés : `packages/mobile/src/**`, App.tsx, Navigation.tsx, barre des 5 onglets, plans.tsx (modifié par un autre agent à 00:26).
À noter sans correction : le tableau `/plans` est serré sur téléphone (15 cellules de moins de 40 px). Ce n'est pas bloquant, à traiter dans un lot séparé.

## Patch A — Super Admin (team.tsx + migration marketplace)
```diff
diff --git a/packages/admin/pages/team.tsx b/packages/admin/pages/team.tsx
index 42eb17f0..831c2ec1 100644
--- a/packages/admin/pages/team.tsx
+++ b/packages/admin/pages/team.tsx
@@ -183,7 +183,7 @@ export default function TeamPage() {
         <p style={{ color: 'var(--text-muted)', lineHeight: 1.55 }}>
           Aucun lien magique n’est envoyé. Si l’adresse n’a pas encore de compte Loki Music, un compte est créé avec un mot de passe temporaire affiché une seule fois. Si elle a déjà un compte Loki Music, son compte utilisateur est conservé et seul le rôle d’administration est ajouté.
         </p>
-        <form onSubmit={createMember} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,2fr) minmax(220px,1fr) auto', gap: 10 }}>
+        <form onSubmit={createMember} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 10 }}>
           <input type="email" placeholder="collaborateur@email.fr" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
           <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} style={inputStyle}>
             {ROLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
@@ -263,7 +263,7 @@ export default function TeamPage() {
           <div style={{ color:'var(--text-muted)', fontSize:12 }}>Nouveau mot de passe généré</div>
           <div style={{ marginTop:6, fontFamily:'monospace', fontSize:17, fontWeight:900, wordBreak:'break-all' }}>{generatedPassword}</div>
         </div>}
-        <form onSubmit={changeOwnPassword} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10 }}>
+        <form onSubmit={changeOwnPassword} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
           <input type={showPassword ? 'text' : 'password'} placeholder="Nouveau mot de passe" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={inputStyle} />
           <input type={showPassword ? 'text' : 'password'} placeholder="Confirmer" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={inputStyle} />
           <button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Masquer' : 'Voir'}</button>
@@ -274,7 +274,7 @@ export default function TeamPage() {
   );
 }
 
-const inputStyle: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 14px' };
+const inputStyle: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 14px', minWidth: 0, maxWidth: '100%' };
 const smallInputStyle: React.CSSProperties = { ...inputStyle, padding: '7px 10px' };
 const th: React.CSSProperties = { textAlign: 'left', padding: '10px 8px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' };
 const td: React.CSSProperties = { padding: '12px 8px', borderBottom: '1px solid var(--border)' };
diff --git a/supabase/migrations/20261005013000_keep_admin_marketplace_currency_text.sql b/supabase/migrations/20261005013000_keep_admin_marketplace_currency_text.sql
new file mode 100644
index 00000000..c4259143
--- /dev/null
+++ b/supabase/migrations/20261005013000_keep_admin_marketplace_currency_text.sql
@@ -0,0 +1,68 @@
+-- ERR-ADMIN-MARKETPLACE-CURRENCY-TYPE-085
+-- Super Admin > Place de marché affichait « structure of query does not match
+-- function result type » (ordinateur ET téléphone). Cause : currency_code est
+-- char(3) (bpchar) dans les tables, mais les 3 RPC déclarent `currency_code text`.
+-- Correctif minimal : cast explicite ::text. Signatures, sécurité (rôles
+-- SUPER_ADMIN/ADMIN/FINANCE), tri et pagination inchangés. Aucune donnée modifiée.
+
+create or replace function public.keep_admin_playlist_sale_offers(p_limit integer default 100, p_offset integer default 0)
+returns table(id uuid, seller_id uuid, seller_username text, playlist_id text, playlist_name text, price_cents integer, currency_code text, is_active boolean, created_at timestamptz, updated_at timestamptz)
+language plpgsql stable security definer set search_path to 'public', 'auth'
+as $function$
+declare v_uid uuid := auth.uid();
+begin
+  if not exists(select 1 from public.admin_users a where a.id=v_uid and a.is_active=true and a.role in ('SUPER_ADMIN'::public.admin_role,'ADMIN'::public.admin_role,'FINANCE'::public.admin_role)) then
+    raise exception 'finance_admin_required' using errcode='42501';
+  end if;
+  return query
+    select o.id, o.seller_id, p.username, o.playlist_id, o.playlist_name, o.price_cents, o.currency_code::text, o.is_active, o.created_at, o.updated_at
+    from public.playlist_sale_offers o
+    join public.profiles p on p.id = o.seller_id
+    order by o.updated_at desc
+    limit greatest(1, least(coalesce(p_limit, 100), 500))
+    offset greatest(0, coalesce(p_offset, 0));
+end;
+$function$;
+
+create or replace function public.keep_admin_playlist_sale_payments(p_limit integer default 100, p_offset integer default 0)
+returns table(id uuid, seller_id uuid, seller_username text, buyer_id uuid, buyer_username text, playlist_name text, amount_cents integer, currency_code text, platform_fee_cents integer, status text, provider text, created_at timestamptz)
+language plpgsql stable security definer set search_path to 'public', 'auth'
+as $function$
+declare v_uid uuid := auth.uid();
+begin
+  if not exists(select 1 from public.admin_users a where a.id=v_uid and a.is_active=true and a.role in ('SUPER_ADMIN'::public.admin_role,'ADMIN'::public.admin_role,'FINANCE'::public.admin_role)) then
+    raise exception 'finance_admin_required' using errcode='42501';
+  end if;
+  return query
+    select pay.id, pay.seller_id, sp.username, pay.buyer_id, bp.username, o.playlist_name, pay.amount_cents, pay.currency_code::text, pay.platform_fee_cents, pay.status, pay.provider, pay.created_at
+    from public.playlist_sale_payments pay
+    join public.playlist_sale_offers o on o.id = pay.offer_id
+    join public.profiles sp on sp.id = pay.seller_id
+    join public.profiles bp on bp.id = pay.buyer_id
+    order by pay.created_at desc
+    limit greatest(1, least(coalesce(p_limit, 100), 500))
+    offset greatest(0, coalesce(p_offset, 0));
+end;
+$function$;
+
+create or replace function public.keep_admin_event_ticket_orders(p_limit integer default 100, p_offset integer default 0)
+returns table(id uuid, seller_id uuid, seller_username text, buyer_id uuid, buyer_username text, event_name text, amount_cents integer, currency_code text, platform_fee_cents integer, status text, provider text, created_at timestamptz)
+language plpgsql stable security definer set search_path to 'public', 'auth'
+as $function$
+declare v_uid uuid := auth.uid();
+begin
+  if not exists(select 1 from public.admin_users a where a.id=v_uid and a.is_active=true and a.role in ('SUPER_ADMIN'::public.admin_role,'ADMIN'::public.admin_role,'FINANCE'::public.admin_role)) then
+    raise exception 'finance_admin_required' using errcode='42501';
+  end if;
+  return query
+    select o.id, o.seller_id, sp.username, o.buyer_id, bp.username, e.name, o.amount_cents,
+           o.currency_code::text, o.platform_fee_cents, o.status, o.provider, o.created_at
+    from public.event_ticket_orders o
+    join public.events e on e.id = o.event_id
+    join public.profiles sp on sp.id = o.seller_id
+    join public.profiles bp on bp.id = o.buyer_id
+    order by o.created_at desc
+    limit greatest(1, least(coalesce(p_limit, 100), 500))
+    offset greatest(0, coalesce(p_offset, 0));
+end;
+$function$;
```

## Patch B — build iOS (KeepShazamModule.swift)
```diff
diff --git a/packages/mobile/modules/keep-shazam/ios/KeepShazamModule.swift b/packages/mobile/modules/keep-shazam/ios/KeepShazamModule.swift
index 8e7d078a..66176a79 100644
--- a/packages/mobile/modules/keep-shazam/ios/KeepShazamModule.swift
+++ b/packages/mobile/modules/keep-shazam/ios/KeepShazamModule.swift
@@ -62,10 +62,8 @@ public class KeepShazamModule: Module {
     let audioTime = AVAudioTime(sampleTime: 0, atRate: audioFile.processingFormat.sampleRate)
     try generator.append(buffer, at: audioTime)
     let signature = generator.signature()
-    let result = await SHSession().result(from: signature)
-
-    switch result {
-    case .match(let match):
+    guard let match = try await self.matchSignature(signature) else { return nil }
+    do {
       guard let item = match.mediaItems.first,
             let title = item.title?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty,
             let artist = item.artist?.trimmingCharacters(in: .whitespacesAndNewlines), !artist.isEmpty else {
@@ -90,15 +88,67 @@ public class KeepShazamModule: Module {
       if !externalURLs.isEmpty { payload["externalUrls"] = externalURLs }
       payload["availableOn"] = item.appleMusicID == nil ? ["Shazam"] : ["Shazam", "Apple Music"]
       return payload
+    }
+  }
 
-    case .noMatch:
-      return nil
+  /// Reconnaissance d'une signature, compatible iOS 15.1 (deploymentTarget de l'app).
+  /// `SHSession.result(from:)` n'existe qu'à partir d'iOS 16 : sans ce garde,
+  /// Xcode refuse de compiler (build TestFlight #162 du 04/10/2026 en échec).
+  /// iOS 16+ : API async native. iOS 15 : API délégué `match(_:)` d'iOS 15.
+  private func matchSignature(_ signature: SHSignature) async throws -> SHMatch? {
+    if #available(iOS 16.0, *) {
+      switch await SHSession().result(from: signature) {
+      case .match(let match): return match
+      case .noMatch: return nil
+      case .error(let error, _): throw error
+      @unknown default: return nil
+      }
+    }
+    return try await KeepShazamLegacyMatcher().match(signature)
+  }
+}
 
-    case .error(let error, _):
-      throw error
+/// Repli iOS 15 : `SHSession` + délégué, converti en async. Une seule réponse
+/// est transmise (garde `finished`), la session reste retenue jusqu'à la fin.
+private final class KeepShazamLegacyMatcher: NSObject, SHSessionDelegate {
+  private let session = SHSession()
+  private var continuation: CheckedContinuation<SHMatch?, Error>?
+  private var finished = false
+  private var keepAlive: KeepShazamLegacyMatcher?
 
-    @unknown default:
-      return nil
+  func match(_ signature: SHSignature) async throws -> SHMatch? {
+    try await withCheckedThrowingContinuation { (cont: CheckedContinuation<SHMatch?, Error>) in
+      self.continuation = cont
+      self.keepAlive = self
+      self.session.delegate = self
+      self.session.match(signature)
+    }
+  }
+
+  private func finish(_ result: Result<SHMatch?, Error>) {
+    guard !finished else { return }
+    finished = true
+    continuation?.resume(with: result)
+    continuation = nil
+    session.delegate = nil
+    keepAlive = nil
+  }
+
+  func session(_ session: SHSession, didFind match: SHMatch) {
+    finish(.success(match))
+  }
+
+  func session(_ session: SHSession, didNotFindMatchFor signature: SHSignature, error: Error?) {
+    if let error = error {
+      let nsError = error as NSError
+      // Pas de correspondance n'est pas une panne : même sémantique que `.noMatch`.
+      if nsError.domain == SHErrorDomain && nsError.code == SHError.Code.matchAttemptFailed.rawValue {
+        finish(.success(nil))
+      } else {
+        finish(.failure(error))
+      }
+    } else {
+      finish(.success(nil))
     }
   }
 }
```

**[VALIDÉ-PAR-CLAUDE]** (n°1, exécuté le 05/10/2026 sur ordre d'Adel) — Patch B (build iOS ShazamKit) et Patch A (`team.tsx`) appliqués tels quels, typecheck admin OK. La migration marketplace `20261005013000_*` est **commitée mais NON appliquée en production** (écriture prod = accord explicite d'Adel requis). Build iOS : preuve = run Auto EAS Build vert + TestFlight (non compilable ici).


### 2026-10-05 01:55 CEST — PROPOSITION CLAUDE (PROPOSEUR) n°2 → en attente [VALIDÉ-PAR-CHATGPT] — Économie FREE v2 (regard marketing + utilisateur)

HEAD de référence : `7d3f48ea`. Il s'agit d'une proposition de règle produit : aucun code, aucun réglage modifié. Adel a demandé de raisonner comme un utilisateur et d'étudier la concurrence. Une fois validée, `docs/PRICING_STRATEGY.md` > « Économie FREE (CANONIQUE) » sera mis à jour **avant** l'étape 2 de l'ordre d'implémentation (compteur d'écoutes).

**1. Fait corrigé, vérifié le 05/10/2026 : la référence concurrente du doc canonique est fausse**
- Le doc affirme « SoundHound freemium = 5 recherches gratuites/mois puis payant ». C'est faux aujourd'hui : SoundHound annonce sur son support « no fees or subscriptions! It is free ».
- Shazam (Apple) est gratuit, sans publicité et sans limite.
- Conséquence côté utilisateur : un blocage à 5 écoutes par jour sera comparé à Shazam, et l'app risque d'être désinstallée dès le premier jour. Le doc l'énonce d'ailleurs lui-même : « Ce qui ne nous coûte rien est illimité ».

**2. Règle proposée pour les écoutes : on facture le coût réel, pas la reconnaissance**
- **Illimité pour tous les comptes** : reconnaissance via ShazamKit sur iPhone, mémoire Loki et liens partagés, qui ne coûtent rien. C'est l'argument marketing n°1 : « Écoute illimitée ».
- **Quota quotidien + 1 FREE au-delà** : seulement pour le repli vers un moteur payant (ACRCloud / AudD), quand ShazamKit n'a rien trouvé, avec les quotas actuels (5 / 30 / 60 / 150).
- Invité (sans compte) : 3 reconnaissances, puis création de compte. Inchangé.
- Ce que l'utilisateur voit : écoute illimitée. Le message « 1 FREE » n'apparaît que pour « recherche avancée » (moteur payant).

**3. Ce qu'on vend : ce que Shazam ne fait pas**
- Collection GARDER (−3 FREE), Battles et packs de solos, Pépites/Drop (commission plateforme sur les ventes), statut « premier découvreur », Compare nos KEEP.
- Premium à 4,99 €/mois, soit 2,4 fois moins cher que Spotify Premium (12,14 €/mois en France). On met en avant l'**annuel à 39,99 €** (≈ 3,33 €/mois, badge « −33 % ») par défaut sur l'écran d'offre.
- Recharges : on garde 0,99 € / 2,49 € / 5,99 € et on ajoute le badge « Le plus choisi » sur le pack de 100 FREE (prix d'ancrage au milieu).
- Gel de série réservé aux abonnés : on garde, c'est le déclencheur d'abonnement.

**4. Repère de conversion corrigé**
- Le doc cite « Duolingo : 4 % des actifs paient (2021) ». Chiffre à jour (rapports Duolingo, T2 2026) : 12,7 M d'abonnés payants pour 140,6 M d'utilisateurs actifs mensuels, soit ≈ 9 %.
- Objectif réaliste pour Loki : 2 à 5 % la première année.

**5. Revenus B2B (le plus gros levier par client)**
- VENUE PRO à 29 €/mois (bars, clubs, hôtels) : prévoir une page de présentation et un essai de 14 jours activable depuis le Super Admin. 10 lieux rapportent autant que 60 abonnés Premium.

**6. Prérequis pour encaisser le premier euro (état réel : 0 € encaissé)**
1. Réparer le build iOS (proposition n°1, ERR-IOS-BUILD-SHAZAM-IOS15-086).
2. Créer dans App Store Connect les 3 abonnements et les 3 packs FREE, puis les relier à `keep-iap-verify`.
3. Inscrire le compte au **App Store Small Business Program** (commission de 15 % au lieu de 30 % sous 1 M$ de revenus). C'est une action d'Adel sur developer.apple.com.

Sources : support.soundhound.com (frais SoundHound) ; fiches App Store / Google Play de Shazam et SoundHound ; spotify.com/fr/premium (12,14 €) ; investors.duolingo.com et classcentral.com (T2 2026) ; developer.apple.com/app-store/small-business-program.


### 2026-10-05 02:05 CEST — PROPOSITION CLAUDE (PROPOSEUR) n°3 → en attente [VALIDÉ-PAR-CHATGPT] — Garde Supabase « Data API grants » (échéance 30/10/2026)

HEAD de référence : `f3be1a7a`. Aucun code n'est poussé, le patch C complet est ci-dessous.

**Contexte (source officielle : https://supabase.com/changelog/45329)** : à partir du **30/10/2026**, toute **nouvelle** table du schéma `public` d'un projet existant n'est plus visible par supabase-js / PostgREST / GraphQL sans `GRANT` explicite. Les tables existantes gardent leurs droits. Si on l'oublie, l'app reçoit « permission denied » et la fonctionnalité semble cassée sans raison visible. Rien dans le dépôt ne protège contre ce cas aujourd'hui.

**Preuve réelle** : appliquée aux migrations depuis le 07/09, la garde trouve plusieurs tables créées sans GRANT (feature_usage_counters, playlist_sale_offers, etc. ; elles fonctionnent seulement grâce aux droits automatiques d'avant). Le cas le plus récent est la migration `20261005000500_iap_free_recharges.sql` (00:05 aujourd'hui) : `keep_iap_free_products` et `keep_iap_consumable_transactions` sont lues par l'app (policies SELECT `to authenticated`) mais n'ont aucun GRANT explicite.

**Correctif proposé (patch C)** :
1. `scripts/verify-migration-grants.cjs` (nouveau, avec auto-test) : toute migration datée de 20261005 ou après qui crée une table `public` doit avoir un `GRANT ... ON public.<table> TO ...` dans la même migration ou une suivante, ou bien le marqueur `-- keep:no-data-api <table>` pour une table interne. Les migrations plus anciennes ne sont pas contrôlées, car leurs tables gardent leurs droits.
2. Le workflow existant `.github/workflows/verify-migrations.yml` reçoit une étape supplémentaire. Aucun nouveau workflow n'est créé.
3. La migration `20261005020000_iap_free_recharges_explicit_grants.sql` rend explicites la lecture `authenticated` et `service_role` des 2 tables IAP. Écritures inchangées (seule la fonction SECURITY DEFINER peut écrire), aucune donnée modifiée.

Tests faits en local : self-test OK ; garde KO sur le HEAD actuel (les 2 tables IAP), puis OK avec la migration 3.
Règle à ajouter pour toutes les IA dans le même commit (CLAUDE.md, section Supabase) : « Toute nouvelle table public = GRANT explicite dans la migration (changement Supabase du 30/10/2026). »

## Patch C — garde grants + migration IAP
```diff
diff --git a/.github/workflows/verify-migrations.yml b/.github/workflows/verify-migrations.yml
index a05da7f2..1eebcea1 100644
--- a/.github/workflows/verify-migrations.yml
+++ b/.github/workflows/verify-migrations.yml
@@ -13,12 +13,14 @@ on:
     paths:
       - "supabase/migrations/**"
       - "supabase/scripts/**"
+      - "scripts/verify-migration-grants.cjs"
       - ".github/workflows/verify-migrations.yml"
   pull_request:
     branches: ['reconcile/claude-main-20260825']
     paths:
       - "supabase/migrations/**"
       - "supabase/scripts/**"
+      - "scripts/verify-migration-grants.cjs"
       - ".github/workflows/verify-migrations.yml"
   workflow_dispatch:
 
@@ -46,6 +48,11 @@ jobs:
       - name: Checkout
         uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
 
+      - name: Garde Supabase Data API grants (30/10/2026)
+        run: |
+          node scripts/verify-migration-grants.cjs --self-test
+          node scripts/verify-migration-grants.cjs
+
       - name: Vérifier les migrations + triggers + RLS
         shell: bash
         run: |
diff --git a/scripts/verify-migration-grants.cjs b/scripts/verify-migration-grants.cjs
new file mode 100644
index 00000000..669f9f37
--- /dev/null
+++ b/scripts/verify-migration-grants.cjs
@@ -0,0 +1,92 @@
+#!/usr/bin/env node
+/**
+ * Garde Supabase « Data API grants » (changement Supabase du 30/10/2026).
+ *
+ * À partir du 30/10/2026, une NOUVELLE table du schéma public n'est plus
+ * exposée automatiquement à supabase-js / PostgREST / GraphQL : sans GRANT
+ * explicite, l'app reçoit « permission denied » sans autre signe.
+ * Source : https://supabase.com/changelog/45329
+ *
+ * Règle : toute migration postérieure à la date de bascule qui crée une table
+ * dans `public` doit, dans cette migration ou une migration suivante, soit contenir un
+ * `GRANT ... ON [TABLE] [public.]<table> TO ...`, soit porter le marqueur
+ * `-- keep:no-data-api <table>` (table interne volontairement non exposée,
+ * utilisée seulement par des fonctions SECURITY DEFINER).
+ *
+ * Les migrations antérieures (tables existantes) gardent leurs droits actuels
+ * selon Supabase et ne sont pas contrôlées.
+ */
+'use strict';
+const fs = require('fs');
+const path = require('path');
+
+const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');
+const CUTOFF_PREFIX = process.env.KEEP_GRANTS_CUTOFF || '20261005';
+
+function tablesCreated(sql) {
+  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
+  const schemaRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?\."?([a-z_][a-z0-9_]*)"?/gi;
+  const nonPublic = new Set();
+  let m;
+  while ((m = schemaRe.exec(sql))) {
+    if (m[1].toLowerCase() !== 'public') nonPublic.add(m[2].toLowerCase());
+  }
+  const out = new Set();
+  while ((m = re.exec(sql))) {
+    const name = m[1].toLowerCase();
+    if (!nonPublic.has(name)) out.add(name);
+  }
+  return [...out];
+}
+
+function hasGrant(sql, table) {
+  const grant = new RegExp(`grant\\s+[^;]*?\\son\\s+(?:table\\s+)?(?:"?public"?\\.)?"?${table}"?\\b[^;]*\\bto\\b`, 'i');
+  const optOut = new RegExp(`--\\s*keep:no-data-api\\s+${table}\\b`, 'i');
+  return grant.test(sql) || optOut.test(sql);
+}
+
+function check(files) {
+  const problems = [];
+  const sqls = files.map((file) => fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''));
+  sqls.forEach((sql, i) => {
+    const laterSql = sqls.slice(i).join('\n');
+    for (const table of tablesCreated(sql)) {
+      if (!hasGrant(laterSql, table)) problems.push(`${path.basename(files[i])} → public.${table}`);
+    }
+  });
+  return problems;
+}
+
+function selfTest() {
+  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'keep-grants-'));
+  const w = (n, s) => { const p = path.join(tmp, n); fs.writeFileSync(p, s); return p; };
+  const ok = w('a.sql', 'create table public.foo (id int);\ngrant select on public.foo to authenticated;');
+  const ok2 = w('b.sql', 'create table if not exists bar (id int);\n-- keep:no-data-api bar');
+  const ok3 = w('c.sql', 'create table private.secret (id int);');
+  const bad = w('d.sql', 'create table public.baz (id int);\ngrant select on public.other to anon;');
+  const r = check([ok, ok2, ok3, bad]);
+  if (r.length !== 1 || !r[0].includes('public.baz')) {
+    console.error('❌ self-test KO', r);
+    process.exit(1);
+  }
+  console.log('✅ self-test verify-migration-grants OK');
+}
+
+if (process.argv.includes('--self-test')) {
+  selfTest();
+  process.exit(0);
+}
+
+const files = fs.readdirSync(MIGRATIONS_DIR)
+  .filter((f) => f.endsWith('.sql') && f.slice(0, 8) >= CUTOFF_PREFIX)
+  .sort()
+  .map((f) => path.join(MIGRATIONS_DIR, f));
+const problems = check(files);
+if (problems.length) {
+  console.error('❌ Nouvelle(s) table(s) public sans GRANT explicite (Supabase Data API, 30/10/2026) :');
+  for (const p of problems) console.error('   - ' + p);
+  console.error('Ajoute (dans la migration ou une suivante) : grant select[, insert, update, delete] on public.<table> to authenticated[, anon, service_role];');
+  console.error('ou, si la table est interne : -- keep:no-data-api <table>');
+  process.exit(1);
+}
+console.log(`✅ Grants Data API OK (${files.length} migration(s) depuis ${CUTOFF_PREFIX} contrôlée(s)).`);
diff --git a/supabase/migrations/20261005020000_iap_free_recharges_explicit_grants.sql b/supabase/migrations/20261005020000_iap_free_recharges_explicit_grants.sql
new file mode 100644
index 00000000..5ad09a1c
--- /dev/null
+++ b/supabase/migrations/20261005020000_iap_free_recharges_explicit_grants.sql
@@ -0,0 +1,11 @@
+-- Supabase Data API : à partir du 30/10/2026, une nouvelle table public n'est
+-- plus exposée sans GRANT explicite (https://supabase.com/changelog/45329).
+-- Les deux tables IAP du 05/10/2026 sont lues par l'app (policies SELECT
+-- `to authenticated`) : on rend le droit de lecture explicite pour qu'une
+-- réinstallation / branche Supabase créée après le 30/10 reste fonctionnelle.
+-- Écriture inchangée : uniquement via public.service_credit_iap_free_purchase
+-- (SECURITY DEFINER, service_role). Aucune donnée modifiée.
+grant select on table public.keep_iap_free_products to authenticated;
+grant select on table public.keep_iap_consumable_transactions to authenticated;
+grant all on table public.keep_iap_free_products to service_role;
+grant all on table public.keep_iap_consumable_transactions to service_role;
```


### 2026-10-05 02:20 CEST — PROPOSITION CLAUDE (PROPOSEUR) n°4 → en attente [VALIDÉ-PAR-CHATGPT] — Cohérence design Loki (demande explicite d'Adel)

HEAD de référence : `3534407e`. Demande d'Adel (05/10, 02:10) : « les écritures ne sont jamais les mêmes selon les pages ou dans les pop-up… un mélange de site internet et d'application ». Il veut une harmonisation avec un regard d'expert, sans rien casser, avec des outils gratuits. Décision d'Adel dans la fenêtre de choix : **garder le look Loki gras, limité à 6 tailles, rien sous 11 px. Pop-ups : fenêtre qui glisse du bas sur téléphone, fenêtre centrée sur ordinateur.**

**Audit en lecture seule (MODE RÉEL, HEAD `3534407e`)**
- Code `packages/mobile/src` : **2 167 tailles de texte écrites à la main, 52 tailles différentes** (6 ; 6,5 ; 7 ; 7,5… jusqu'à 72), **825 couleurs hex écrites à la main (252 différentes)**, **52 arrondis différents**. L'échelle `theme/spacing.ts > typography` existe mais n'est utilisée que 5 fois.
- **65 fenêtres `<Modal>` faites « maison »** en dehors d'AlertHost : 53 en `fade` (rendu « site web ») contre 11 en `slide` (rendu « app »). Les pires fichiers : KeepBattleMobileGameV3 (206 tailles, 4 fenêtres), ProfilePublicScreen (175, 7), PartiesScreen (156, 8), MyMusicScreen (150, 5), PublicUserProfileScreen (141, 6).
- Live, page Écouter à 712 px : **10 styles de texte sur un seul écran**, des onglets en 10 px, du texte en **8 px (« TCHAT ») et 6,5 px (« LOKI »)**.
- Live, « Mes Sessions » : le titre fait 26/700 alors que celui d'Écouter fait 34/700. Deux boutons côte à côte ont des styles différents : « SWIPER · 8 » en 10 px/900 majuscules, « Supprimer » en 12 px/800 minuscules.

**Lot 4a (cette proposition) : AUCUN changement visuel**
1. `packages/mobile/src/theme/lokiText.ts` : les 6 styles Loki (screenTitle 28/800, blockTitle 18/800, body 15/500, secondary 13/500, label 11/800, button 15/800) et `LOKI_MIN_FONT_SIZE = 11`, exportés par `theme/index.ts`. L'ancien `typography` n'est pas touché.
2. `scripts/verify-design-consistency.cjs` + `config/design-consistency-baseline.json` : un **cliquet**. Les compteurs ci-dessus deviennent la base. Un commit peut les faire baisser (migration), jamais monter (nouvelle valeur écrite à la main). `--report` donne le classement des fichiers.
3. `.github/workflows/design-interaction-guardian.yml` : une étape en plus dans le workflow existant. Aucun nouveau workflow.

**Lots suivants (un lot validé à chaque fois, preuves 390×844 et 1440×900, cliquet en baisse) :**
- 4b : composant unique `LokiSheet`. Sur téléphone, il glisse du bas avec poignée, défile à l'intérieur et garde les boutons fixés en bas, en reprenant les règles §9 d'AlertHost. Sur ordinateur (≥ 900 px), c'est une fenêtre centrée. Les 65 fenêtres migrent ensuite, en commençant par les plus petites.
- 4c : écran par écran, migration des tailles vers `lokiText`, en commençant par les textes sous 11 px et les rangées de boutons qui ne sont pas homogènes.
- Règle à ajouter dans `docs/KEEP_CAHIER_DES_CHARGES_UI.md` §11 : « Texte : uniquement les 6 styles lokiText. Fenêtres : uniquement LokiSheet / AlertHost. »

Rappel : `Navigation.tsx`, la barre des 5 onglets et `App.tsx` ne sont pas touchés par le lot 4a. Les lots 4b/4c les toucheront seulement si Adel le demande explicitement, onglet par onglet.

## Patch D — lot 4a (aucun rendu modifié)
```diff
diff --git a/.github/workflows/design-interaction-guardian.yml b/.github/workflows/design-interaction-guardian.yml
index db9b9694..9c029c83 100644
--- a/.github/workflows/design-interaction-guardian.yml
+++ b/.github/workflows/design-interaction-guardian.yml
@@ -40,6 +40,8 @@ jobs:
       - run: npm ci
       - name: Typecheck Super Admin
         run: npm --workspace packages/admin run type-check
+      - name: Cliquet cohérence design Loki (tailles, couleurs, pop-ups)
+        run: node scripts/verify-design-consistency.cjs
       - name: Enforce Loki interaction and readability contract
         run: |
           node scripts/verify-mobile-accessibility-contract.cjs
diff --git a/config/design-consistency-baseline.json b/config/design-consistency-baseline.json
new file mode 100644
index 00000000..55f52efd
--- /dev/null
+++ b/config/design-consistency-baseline.json
@@ -0,0 +1,10 @@
+{
+  "literalFontSize": 2167,
+  "distinctFontSizes": 52,
+  "literalHexColors": 825,
+  "distinctHexColors": 252,
+  "distinctRadii": 52,
+  "rawModals": 65,
+  "_comment": "Cliquet design Loki : ces valeurs ne doivent jamais augmenter. Les baisser via --update après une migration vers les tokens.",
+  "_measuredAt": "2026-10-04"
+}
diff --git a/packages/mobile/src/theme/index.ts b/packages/mobile/src/theme/index.ts
index f544dfa5..c7cb558b 100644
--- a/packages/mobile/src/theme/index.ts
+++ b/packages/mobile/src/theme/index.ts
@@ -1,2 +1,3 @@
 export * from './colors';
 export * from './spacing';
+export * from './lokiText';
diff --git a/packages/mobile/src/theme/lokiText.ts b/packages/mobile/src/theme/lokiText.ts
new file mode 100644
index 00000000..0e8245ca
--- /dev/null
+++ b/packages/mobile/src/theme/lokiText.ts
@@ -0,0 +1,27 @@
+/**
+ * Échelle de texte Loki — décision d'Adel du 05/10/2026 (« garder le look Loki gras »).
+ *
+ * 6 styles seulement, partout (écrans, pop-ups, téléphone et ordinateur).
+ * Rien sous 11 px. Les écrans migrent vers ces styles un par un (cliquet
+ * scripts/verify-design-consistency.cjs : le nombre de tailles « en dur » ne
+ * peut que baisser). Ajouter ce fichier ne change aucun rendu existant.
+ */
+export const lokiText = {
+  /** Titre d'écran (« Écouter », « Mes Sessions »…) */
+  screenTitle: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.3 },
+  /** Titre de bloc, de carte ou de pop-up */
+  blockTitle: { fontSize: 18, fontWeight: '800' as const },
+  /** Texte courant */
+  body: { fontSize: 15, fontWeight: '500' as const, lineHeight: 21 },
+  /** Information secondaire (date, compteur, sous-titre) */
+  secondary: { fontSize: 13, fontWeight: '500' as const, lineHeight: 18 },
+  /** Étiquette / badge / onglet — taille minimale autorisée */
+  label: { fontSize: 11, fontWeight: '800' as const, letterSpacing: 0.4 },
+  /** Libellé de bouton (même style pour TOUS les boutons d'une même rangée) */
+  button: { fontSize: 15, fontWeight: '800' as const },
+} as const;
+
+export type LokiTextVariant = keyof typeof lokiText;
+
+/** Taille minimale lisible (Apple HIG : 11 pt). */
+export const LOKI_MIN_FONT_SIZE = 11;
diff --git a/scripts/verify-design-consistency.cjs b/scripts/verify-design-consistency.cjs
new file mode 100644
index 00000000..76c854b7
--- /dev/null
+++ b/scripts/verify-design-consistency.cjs
@@ -0,0 +1,100 @@
+#!/usr/bin/env node
+/**
+ * Cliquet de cohérence design Loki (mobile + web, source unique packages/mobile/src).
+ *
+ * Problème mesuré le 05/10/2026 : tailles de texte, graisses, couleurs, arrondis
+ * et fenêtres codés « à la main » écran par écran. Résultat : les écritures ne sont
+ * jamais les mêmes d'une page ou d'une pop-up à l'autre, avec un rendu mi-site, mi-app.
+ *
+ * Principe « cliquet » : on ne casse rien et on ne réécrit rien d'un coup.
+ * Les compteurs actuels sont la base (config/design-consistency-baseline.json).
+ * Un commit peut les faire BAISSER (migration vers les tokens) mais jamais MONTER.
+ *   node scripts/verify-design-consistency.cjs            → contrôle (CI)
+ *   node scripts/verify-design-consistency.cjs --report   → rapport détaillé
+ *   node scripts/verify-design-consistency.cjs --update   → enregistre une baisse
+ */
+'use strict';
+const fs = require('fs');
+const path = require('path');
+
+const ROOT = path.join(__dirname, '..');
+const SRC = path.join(ROOT, 'packages', 'mobile', 'src');
+const BASELINE = path.join(ROOT, 'config', 'design-consistency-baseline.json');
+
+function walk(dir, out = []) {
+  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
+    const p = path.join(dir, e.name);
+    if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p, out); }
+    else if (/\.tsx$/.test(e.name)) out.push(p);
+  }
+  return out;
+}
+
+function measure() {
+  const files = walk(SRC);
+  const m = { literalFontSize: 0, distinctFontSizes: new Set(), literalHexColors: 0, distinctHexColors: new Set(),
+    distinctRadii: new Set(), rawModals: 0, fadeModals: 0, slideModals: 0, perFile: {} };
+  for (const f of files) {
+    const s = fs.readFileSync(f, 'utf8');
+    const rel = path.relative(ROOT, f);
+    const fs_ = s.match(/fontSize:\s*[0-9.]+/g) || [];
+    const hex = s.match(/#[0-9a-fA-F]{6}\b/g) || [];
+    const rad = s.match(/borderRadius:\s*[0-9.]+/g) || [];
+    const modals = (s.match(/<Modal\b/g) || []).length;
+    m.literalFontSize += fs_.length;
+    fs_.forEach((x) => m.distinctFontSizes.add(x.replace(/fontSize:\s*/, '')));
+    m.literalHexColors += hex.length;
+    hex.forEach((x) => m.distinctHexColors.add(x.toUpperCase()));
+    rad.forEach((x) => m.distinctRadii.add(x.replace(/borderRadius:\s*/, '')));
+    if (!/AlertHost\.tsx$/.test(f)) m.rawModals += modals;
+    m.fadeModals += (s.match(/animationType=["{']*fade/g) || []).length;
+    m.slideModals += (s.match(/animationType=["{']*slide/g) || []).length;
+    if (fs_.length || modals) m.perFile[rel] = { fontSize: fs_.length, modals, hex: hex.length };
+  }
+  return {
+    literalFontSize: m.literalFontSize,
+    distinctFontSizes: m.distinctFontSizes.size,
+    literalHexColors: m.literalHexColors,
+    distinctHexColors: m.distinctHexColors.size,
+    distinctRadii: m.distinctRadii.size,
+    rawModals: m.rawModals,
+    fadeModals: m.fadeModals,
+    slideModals: m.slideModals,
+    _sizes: [...m.distinctFontSizes].map(Number).sort((a, b) => a - b),
+    _perFile: m.perFile,
+  };
+}
+
+const KEYS = ['literalFontSize', 'distinctFontSizes', 'literalHexColors', 'distinctHexColors', 'distinctRadii', 'rawModals'];
+const now = measure();
+
+if (process.argv.includes('--report')) {
+  console.log('Cohérence design Loki — mesure réelle');
+  for (const k of [...KEYS, 'fadeModals', 'slideModals']) console.log(`  ${k.padEnd(20)} ${now[k]}`);
+  console.log('  tailles de texte utilisées :', now._sizes.join(', '));
+  const top = Object.entries(now._perFile).sort((a, b) => b[1].fontSize - a[1].fontSize).slice(0, 15);
+  console.log('  fichiers les plus dispersés (tailles de texte en dur) :');
+  for (const [f, v] of top) console.log(`    ${String(v.fontSize).padStart(4)}  ${f}${v.modals ? `  (${v.modals} fenêtre(s) maison)` : ''}`);
+  process.exit(0);
+}
+
+if (process.argv.includes('--update') || !fs.existsSync(BASELINE)) {
+  const base = Object.fromEntries(KEYS.map((k) => [k, now[k]]));
+  base._comment = 'Cliquet design Loki : ces valeurs ne doivent jamais augmenter. Les baisser via --update après une migration vers les tokens.';
+  base._measuredAt = new Date().toISOString().slice(0, 10);
+  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
+  fs.writeFileSync(BASELINE, JSON.stringify(base, null, 2) + '\n');
+  console.log('✅ Base enregistrée :', JSON.stringify(base));
+  process.exit(0);
+}
+
+const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
+const worse = KEYS.filter((k) => now[k] > base[k]);
+if (worse.length) {
+  console.error('❌ Cohérence design en recul (une nouvelle valeur « en dur » a été ajoutée) :');
+  for (const k of worse) console.error(`   - ${k} : ${base[k]} → ${now[k]}`);
+  console.error('Utilise les tokens de packages/mobile/src/theme (typography, colors, radius) et la feuille Loki commune au lieu d\'une nouvelle valeur.');
+  process.exit(1);
+}
+const better = KEYS.filter((k) => now[k] < base[k]);
+console.log(`✅ Cohérence design : aucun recul${better.length ? ` (amélioré : ${better.join(', ')} — lance --update pour verrouiller)` : ''}.`);
```


### 2026-10-05 02:40 CEST — PROPOSITION CLAUDE (PROPOSEUR) n°5 → en attente [VALIDÉ-PAR-CHATGPT] — Notifications fiables, maîtrisées, rapides + mises à jour à distance sûres

HEAD de référence : `ca9391e4`. Proposition de périmètre seulement (pas de code poussé). Décisions d'Adel du 05/10 02:35, prises dans les fenêtres de choix : **promos bloquées pour FREE, désactivables par les abonnés ; plafond de 8 alertes téléphone/jour avec regroupement.**

**Faits vérifiés (MODE RÉEL, Supabase live, lecture seule)**
- Clé APNs remplacée par Adel le 05/10 : `9668XNGA8C` (Sandbox & Production) dans Expo, à la place de `86S5KDJGVC` (Sandbox seule, cause des `BadEnvironmentKeyInToken`). Test Super Admin → @adel4A : **DELIVERED** (premier push délivré de l'histoire du projet). 11 s d'attente côté serveur (robot `keep-push-worker-every-30-seconds`).
- **Un seul appareil** dans `push_tokens` pour 17 profils (324 envois `NO_DEVICE` en 7 jours). Le parcours de demande d'autorisation et d'enregistrement du jeton doit être revu sur iPhone.
- Volume : 402 notifications en 7 j, moyenne 7,4 par profil et par jour, **maximum 44 par profil et par jour**. `NEW_PUBLIC_KEEP` = 116 (29 %), `BATTLE_INVITE` = 52.
- `keep-push-worker` respecte 6 interrupteurs (system, social, events, money, battle, music). **`marketing_enabled` et `dj_enabled` existent dans `notification_preferences` et dans l'app, mais le worker ne les lit jamais.** `LOKI_PULSE_NEW`, `PLAYLIST_SALE_NEW_OFFER` et `CHAT_ACTIVATION_AVAILABLE` tombent dans « system » : l'interrupteur « promos » de l'app n'a donc aucun effet.
- `notification_access_rules` : 40 types, tous `is_locked=false`, `min_plan_code=FREE`.
- Garde OTA (`eas-update-production.yml`) : `baseline` = dernier commit touchant `.eas-build-trigger`, donc égal à HEAD au moment d'une release, et le diff natif est toujours vide. L'OTA `1e044b11` a été publiée alors que le build #162 avait échoué : du JS demandant `expo-application`, absent du binaire 373, tourne donc sur les iPhone.
- Solos épuisés (`KeepBattleMobileGameV3`) : la fenêtre propose « Acheter des Solos » et « Jouer en BATTLE », mais **aucune offre Premium**. Écoute sans FREE (`HomeScreenCompact`) : « RECHARGER » et « PASSER PREMIUM », conforme.

**Lot 5 proposé**
1. `keep-push-worker` : catégorie `marketing` (LOKI_PULSE_NEW, PLAYLIST_SALE_NEW_OFFER, CHAT_ACTIVATION_AVAILABLE, ADMIN_BROADCAST promo) lue depuis `marketing_enabled`. Pour un profil FREE, l'interrupteur marketing est ignoré, et l'app l'affiche verrouillé avec « Disponible avec un abonnement ». Tout le reste est désactivable par tous. L'iPhone garde de toute façon son réglage système (règle Apple).
2. Plafond de **8 alertes téléphone/jour/profil** (`remote_config.push_daily_cap`, réglable depuis le Super Admin). AGORA_DIRECT et la catégorie money ne sont jamais plafonnés. Au-delà, la notification reste dans l'app sans alerte sur le téléphone.
3. Regroupement de `NEW_PUBLIC_KEEP` : une seule alerte « X nouveaux morceaux de @a, @b… » par fenêtre de 30 min.
4. Envoi immédiat : trigger `AFTER INSERT` (par instruction) sur `notifications` → `pg_net` vers `keep-push-worker`, avec anti-rafale. Le cron de 30 s reste en secours.
5. Garde OTA : comparer à la dernière release dont le build iOS a **réussi** (tag `testflight-built-<n>` posé par `auto-eas-build.yml` en cas de succès). Aucune OTA si le build de la même release a échoué.
6. Fenêtre « Solos épuisés » : ajouter « Passer Premium » (AlertHost, règles §9, 3 boutons maximum : Acheter des Solos · Passer Premium · OK). Le bouton « Jouer en BATTLE » passe dans le texte.

Tests prévus : tests Deno du worker (catégories, plafond, exemptions) ; migration vérifiée par `verify-migrations` ; contrat jest pour la fenêtre Solos ; mesure live des statuts dans `push_delivery_attempts` après déploiement.

**[VALIDÉ-PAR-CLAUDE]** (n°5, exécuté le 05/10/2026) — Fait : catégorie marketing lue par le worker, plafond 8/24 h (`push_daily_cap`, DM et argent exemptés, statut `CAPPED_IN_APP`), trigger de réveil immédiat (anti-rafale 2 s), garde OTA liée au build iOS réussi, « Passer Premium » dans la fenêtre Solos. Constat : le verrou FREE de l'interrupteur promos existait déjà (trigger SQL + `NotificationsScreen`), et `NEW_PUBLIC_KEEP`/`LOKI_PULSE_NEW` sont déjà « in-app only » (le regroupement 5.3 n'a donc pas d'objet). Découvert : le worker écrivait `SUPPRESSED_DUPLICATE`, absent de la contrainte SQL (ERR-PUSH-STATUS-CONSTRAINT-089). **Migration `20261005050000_*` et déploiement de la fonction non faits en production** (accord d'Adel requis).


### 2026-10-05 02:55 CEST — PROPOSITION CLAUDE (PROPOSEUR) n°6 → en attente [VALIDÉ-PAR-CHATGPT] — Réorganisation « app qui parle d'elle-même » (demande explicite d'Adel)

HEAD de référence : `af5c1aa5`. Proposition de périmètre. **Adel autorise explicitement (05/10 02:50) la modification de la barre des 5 onglets et de `Navigation.tsx`** pour ce lot, avec une règle absolue : **rien n'est supprimé**, tout ce qui existe reste accessible en 1 clic. Budget serré : uniquement le code existant et des outils gratuits.

**Constat (MODE RÉEL)**
- Onglets actuels : Loki Music (Écouter) · Découvertes · Playlists · Soirées · Profil. **Battle est rangé dans « Soirées »** (`PartiesScreen`), le **tchat** n'est qu'une petite bulle flottante (`GlobalChatDock`), et le bouton **☰ ouvre « Mes Sessions »** au lieu d'un menu.
- Supabase : **1 profil sur 17 a `onboarding_completed_at`** rempli. 8 sur 17 suivent quelqu'un. Les nouveaux utilisateurs se perdent (retour d'Adel).

**Décisions d'Adel (fenêtres de choix)**
1. Nouvelle barre : **Écouter · Découvrir · Battle · Tchat · Profil**.
   - Découvrir contient l'existant Découvertes + Soirées/Événements + Pépites/Drop (sous-onglets en haut).
   - Battle = l'écran Battle actuel (solo, défis, arène), sorti de Soirées.
   - Tchat = la liste des conversations (`MusicAgoraPanel`) en plein écran. La bulle flottante reste pour répondre vite.
   - Profil contient l'existant + Playlists + Ma musique + Mes Sessions.
   - ☰ devient un vrai menu : Mes FREE · Offres · Notifications · Réglages · Aide · Mes Sessions.
2. **Missions de départ + FREE** (modèle Duolingo) : une carte « Tes 5 premières missions » sur Écouter. Écoute un morceau → GARDE-le → lance un Battle → rejoins un groupe → invite un ami. Chaque mission rapporte des FREE côté serveur (idempotent, valeurs dans `remote_config`), avec une animation de récompense, puis la carte disparaît. `onboarding_completed_at` est rempli à la 5e mission.

**Garde-fous**
- Inventaire avant/après de **toutes les routes et tous les boutons** (script dans le même lot) : la PR échoue si une destination existante disparaît.
- Mobile et web via la source unique `packages/mobile/src`. Preuves 390×844 et 1440×900, robots Playwright existants mis à jour dans le même commit.
- Cliquet design n°4 (si validé) : aucune nouvelle taille ou couleur écrite à la main.
- Un lot par étape : (6a) barre + menu ☰, (6b) missions + FREE serveur, (6c) animations de récompense. Chaque étape fait l'objet d'une proposition validée séparément.

**[VALIDÉ-PAR-CLAUDE]** (n°6, étape sûre uniquement, choix d'Adel du 05/10/2026) — Livré : `scripts/verify-route-inventory.cjs` + `config/route-inventory.json` (aucune route ne peut disparaître, aucun bouton ne peut viser une route inconnue), branché dans `web-preview-pages.yml`. **Barre à 5 onglets / menu ☰ / missions NON modifiés** : le Battle est lié à `PartiesScreen` (garde « Quitter la partie », disponibilité, audio, notifications). Lot 6a à rejouer à part, validé écran par écran, avec test iPhone réel.


### 2026-10-05 03:10 CEST — PROPOSITION CLAUDE (PROPOSEUR) n°7 → en attente [VALIDÉ-PAR-CHATGPT] — Parcours mobile : test utilisateur réel 390×844

Test MODE RÉEL du site public, cadre 390×844, compte connecté, tous les onglets parcourus et mesurés (texte < 11 px, éléments hors écran). Complète les n°4 (design) et n°6 (onglets + missions). Rien n'est supprimé.

| Écran | Constat | Correctif proposé |
|---|---|---|
| Écouter | 21 textes < 11 px (« NEW » en 6 px, noms d'artistes des bulles en 9 px) ; 9 éléments hors écran (rangée de bulles + dock tchat) | Tailles `lokiText` ; bulles en défilement horizontal assumé (fondu de bord), dock tchat dans la zone sûre |
| Découvrir | **Écran vide par défaut** (« Aucun profil n'est affiché par défaut… appuie sur RECHERCHER »), puces de distance coupées à droite (« 250 · 5… ») | Afficher d'emblée les profils à 25 km (déjà le choix par défaut), puces sur 2 lignes ou en défilement, RECHERCHER seulement pour affiner |
| Playlists | Lisible et clair ; 10 textes < 11 px | Tailles `lokiText` seulement |
| Soirées | **Battle caché dans un 2e sous-onglet** ; 3 cartes vides de contenu | Voir n°6 (onglet Battle dédié) |
| Battle | **Surcharge avant de jouer** : 3 compteurs FREE, reset, solos, prochain crédit, format, nombre de morceaux, styles… puis SOLO / EN LIGNE tout en bas | Gros bouton **JOUER** en premier (réglages mémorisés), compteurs repliés dans « Mes FREE », réglages derrière « Personnaliser » |
| Profil | 23 textes < 11 px (« Abonnés », « Reprises », « FREE » en 8 px, « PLUS » en 7 px) ; dock tchat qui chevauche la boutique | Tailles `lokiText`, dock dans la zone sûre |

Preuves de non-régression pour chaque écran : captures 390×844 et 1440×900 avant/après, robots Playwright existants, cliquet design (n°4).


### 2026-10-05 03:40 CEST — PROPOSITION CLAUDE (PROPOSEUR) n°8 → en attente [VALIDÉ-PAR-CHATGPT] — Publication web bloquée + parcours profil/boutique/goûts

**1. URGENT : le site public est figé sur la release du 04/10 04:12 (`39f38c03`), comme l'iPhone.**
- La publication web est verrouillée sur le SHA de release. Le run « Web public officiel » #3427 (release `1e044b1`, 04/10 17:31) a **échoué à l'étape 18** « Block black page before publish ». Le robot a bien joué son rôle : rien de cassé n'a été publié.
- Erreurs du contrôle : sur `android-pixel7`, **« barre des 5 onglets non visible (visibles : Loki Music) »** et « mauvais onglet actif » sur /Main/Listen, /Main/Discover, /Main/MyMusic, /Main/Parties, à l'ouverture comme au rechargement.
- Conséquence : les corrections faites depuis (par exemple le menu ☰ « 1 appui = la fonction » via `directMenuAction` dans `ProfilePublicScreen.tsx`) sont dans le code mais **invisibles pour les utilisateurs**. Adel voit encore les panneaux intermédiaires avec un 2e bouton et un grand vide noir.
- À faire par l'agent exécutant : reproduire l'export Expo de `1e044b1` → HEAD dans Chromium Pixel 7 (412×915), corriger la cause racine (barre d'onglets non rendue en Android web), puis republier par la chaîne unique `web-preview-pages.yml`. Ne jamais affaiblir le contrôle.

**2. Boutique musicale (vue visiteur, profil adel4A, MODE RÉEL)**
- Ça fonctionne : 2 collections publiques affichées, filtres « Tout 2 · FREE 1 · € 1 ».
- **Bug de données** : le nombre de titres est écrit **dans le nom** à la création (« Ma collection · 8 titres ») alors que la collection en contient 10. La carte affiche « 8 titres » au-dessus de « 10 titres ». Correctif : nom sans compteur, compteur toujours calculé. Pour l'existant, afficher le nom sans le suffixe « · N titres ». Données utilisateur non modifiées.
- Répétitions : « Boutique musicale » écrit 3 fois, et la Pépite « à la une » répétée dans la grille. Les deux collections portent le même nom « Ma collection ».
- Sur son propre profil, un bloc « BOUTIQUE MUSICALE 1/1 » montre la collection **d'un autre** (un achat) : le renommer « Mes achats » et le séparer de « Ma boutique ».

**3. « Construis ton univers musical » (Loki Pulse, ☰ > Mes goûts)** : toutes les informations sont utiles (Adel), mais tout est sur un seul écran (préremplissage pays/langue, 3 onglets, recherche, puces sélectionnées, familles de styles, 2 boutons). Proposition : 3 étapes guidées (1. Styles avec grosses bulles et aperçu · 2. Langues/pays déjà remplis, à confirmer · 3. Récapitulatif « Créer mon Pulse ») avec une barre de progression, sans retirer aucun champ.

**4. Règles permanentes à ajouter dans `docs/KEEP_CAHIER_DES_CHARGES_UI.md` §11 (anti-« utilisateur perdu »)**
- 1 écran = 1 objectif principal et 1 bouton principal visible sans défiler.
- Aucun panneau intermédiaire qui ne contient qu'un texte + 1 bouton : le 1er appui ouvre la fonction.
- Pas de grand vide : une fenêtre s'ajuste à son contenu (pas de hauteur fixe).
- Formulaire de plus de 5 contrôles = étapes avec progression.
- Jamais de nombre figé dans un nom saisi : les compteurs sont toujours calculés.
- Un même bloc n'apparaît qu'une fois par écran.

**[VALIDÉ-PAR-CLAUDE]** (n°8, exécuté le 05/10/2026) — Cause racine reproduite en local (Chromium PC/tablette/Pixel 7) : depuis la décision « ordinateur = QR uniquement », le site non connecté affiche « Connexion ordinateur » sans barre d'onglets ; le robot n'avait pas de session. `web-visible-surface-gate.cjs` simule un appareil approuvé + contrôle l'écran QR séparément, sans affaiblir le contrôle (ERR-PAGES-VISIBLE-TABS-GATE-078). Points 2-4 (boutique, univers musical, règles §11) non traités dans cette passe.


### 2026-10-05 04:00 CEST — PROPOSITION CLAUDE (PROPOSEUR) n°9 → en attente [VALIDÉ-PAR-CHATGPT] — Moteur « donner l'envie d'avoir envie » (devise d'Adel)

Adel valide (05/10 04:00) : objectif viralité + revenus. Proposition de périmètre, un lot validé à chaque fois, et rien n'est supprimé.

1. **Prix (décision à confirmer en base + App Store Connect, même commit)** : Premium **4,99 €/mois** (doc stratégie) au lieu de 2,99 € actif dans `plan_prices` ; annuels **activés** (Premium 39,99 €, Creator 79 €, Venue 279 €) et mis en avant avec le badge « −33 % ». Les prix restent réglables dans le Super Admin.
2. **Écran Offres lisible par un enfant de 13 ans** : 3 cartes en haut (**Gratuit · Premium · Recharger FREE**), une phrase et un prix chacune. Les textes longs (« Ta mission… », « Comment Loki grandit… ») passent dans « En savoir plus ». Packs 30/100/300 FREE visibles (badge « Le plus choisi » sur 100).
3. **Notifications iPhone actionnables** (nouveau build requis) : catégories `expo-notifications` avec boutons. « ▶ Écouter » (nouveau KEEP / Pulse) ouvre directement la lecture ; « ＋ Suivre en retour » (nouvel abonné) agit sans ouvrir l'app ; « Répondre » (tchat). Chaque bouton respecte les interrupteurs et le plafond de la n°5.
4. **Partage viral** : carte image « Mon Loki de la semaine » (top découvertes, rang Battle, badge premier découvreur, lien de parrainage) à partager en 1 clic vers TikTok/Instagram ; bouton « Défie un ami » juste après une victoire Battle ou une 1re découverte.
5. **Série quotidienne + gel** (déjà décidé dans l'économie FREE) visible sur Écouter, avec animation de récompense.
6. **International** : langue détectée automatiquement (langue de l'appareil, réglable), interface traduite (`packages/mobile/src/i18n` existant), **traduction automatique des messages du tchat** à la demande (« Traduire »), devise et prix App Store par pays. Le contenu musical n'est pas traduit.
7. **Mesure gratuite** (PostHog, offre gratuite, connecteur déjà présent) : retour J1/J7/J30, missions terminées, partages, conversions vers Offres, pour piloter avec des chiffres.

Ordre conseillé : n°8 → n°1 → n°5 → n°9.1-9.2 → n°6 → n°9.3-9.7.

**[VALIDÉ-PAR-CLAUDE]** (n°9.1-9.2 seulement, exécuté le 05/10/2026) — Écran Offres : 3 cartes (Gratuit · Premium · Recharger FREE), textes longs repliés dans « En savoir plus » (rien supprimé), contrat jest. Migration `20261005060000_premium_price_4_99.sql` commitée, **non appliquée en production**; le prix réellement débité reste celui d'App Store Connect. Abonnements annuels / badge −33 % **non faits** : il n'existe pas de produits annuels App Store Connect (le code ne lit que `MONTHLY`). 9.3-9.7 non traités.

## RÈGLES PERMANENTES D'ADEL (07/10/2026) — à appliquer sans qu'il le redise, à chaque modification
1. **Contraste** : jamais de texte foncé (noir, violet foncé, gris foncé) sur fond foncé. Texte clair sur fond sombre (contraste ≥ 4,5:1). Garde-fous : `packages/admin/scripts/check-contrast.js` (bloque le build Super Admin) et `packages/mobile/src/theme/__tests__/textContrast.test.ts`. Toute erreur de ce type vue en passant est corrigée immédiatement.
2. **Zéro clavier** : Adel n'écrit jamais. Tout est pré-rempli : listes, cases, modèles, « Autre… » en dernier recours (composant unique `packages/admin/components/PresetPicker.tsx`).
3. **2 mots par texte visible**, le reste dans « En savoir plus » ou expliqué par le robot.
4. **Robot** : chaque bouton du robot mène à une destination vérifiée automatiquement (`check-robot-links.js`) ; il parle en envies (« Tu veux… ? »), propose 3 choix + Autre, et sa bulle se pousse sur le côté.
5. **Nom** : on écrit « Loki Music », jamais « Keep » dans un texte visible.
6. **Design ordinateur ≠ design téléphone** : chaque écran validé en 390 px et 1440 px.
7. **Compte neuf = vierge** ; payants et offerts jamais mélangés ; pays et devises jamais mélangés.
8. **Chaque nouvelle idée d'Adel** est notée dans le plan et rangée dans la tâche concernée, sans arrêter le chantier en cours ; chaque rapport finit par « Ce qui reste à faire ».


### 08/10/2026 — Codex → Claude Code — correctif préparé, intégration et accès restants
Statut : NOTE DÉPOSÉE, pas d’accusé de lecture ni de déclenchement automatique de Claude.

Adel autorise toutes les réparations faisables et demande de laisser ici les actions nécessitant son ordinateur ou un humain. Respecter ses sessions, aucun logout, aucun verrou qui bloque l’autre agent.

**Code fourni :** `docs/patches/2026-10-08-sessions-plus.patch`, commit `35b230e9f8a4d7f21afd7158e36984c93562e9be`. Patch NON APPLIQUÉ au produit ; relu distant byte-for-byte. Basé sur les fichiers produit de fa193cc5 (HEAD documentaire689d50c9). Ne pas écraser les travaux locaux : examiner le diff, puis appliquer uniquement si le contexte correspond.

Contenu :
- compteur basé sur toutes les sessions pending, pas tracks.length de l’écoute en cours ;
- session active prioritaire sur son ancien instantané, sans double comptage ;
- nombre de sessions dans badge, nombre de morceaux conservé pour les messages du robot ;
- ClampedText réutilisé dans Découverte pour la description de soirée, Plus/Moins visible, accessibilité descriptive conservée ;
-5 tests Jest joints (archive, résolus, snapshot périmé, session active, non-mutation).
Vérification Codex : comportement ancien reproduit en échec ;5 cas exécutés avec le vrai helper transpillé,2 rendus React serveur de ClampedText,0 diagnostic syntaxique TypeScript. Premier harnais avait une cible ES5 inadéquate pour Map ; relancé en ES2020. Cela ne remplace PAS tsc du projet, Jest complet, export Expo et viewport.

**À exécuter sur le poste, sans intervention humaine si l’environnement est prêt :**
1. Lire état local/git et travaux Claude avant application. Actualiser contrat/spec et assertions de copie devenues obsolètes dans le même lot, sans réduire les gardes. Compléter les autres libellés En savoir plus visibles par Plus (inventaire dans journal ea955e81).
2. Exécuter tests ciblés puis suite/typechecks requis, export et rendu390×844/1440×900. Patch UI à intégrer/publier uniquement après ces preuves. Aucun besoin d’une nouvelle API pour ces corrections.
3. Micro : implémenter UNE barrière asynchrone commune arrêt reconnaissance → archivage idempotent → libération effective capture → navigation/lecture. Couvrir TopBar, robot, accès directs SessionHistory/SessionRecap. Retirer GARDER et la lecture automatique de la reconnaissance active, proposer Ma session ; garder les fonctions de tri dans les sessions. Ne pas faire simplement deux cancelAudioCapture successifs : le premier prend activeRecording et le second peut terminer avant son stopAndUnloadAsync.
4. QR : priorité sécurité, faits dans journal ea955e81. Confirmation téléphone, secret navigateur distinct, claim atomique, register non réactivable après révocation, révocation ciblée serveur. Ne pas couper les sessions existantes et ne pas confondre generateLink avec envoi e-mail.
5. Continuer les lots stories24h/audio réel, identité artistes Maes, performances Solo/Battle, bot secousse unique, statistiques/Pulse et soirées/MP3 selon IDEAS_INBOX. Ces lots ne sont PAS couverts par ce patch.
6. Catalogue serveur déjà corrigé en production : SQL exact/résultats dans journal ea955e81. Générer le miroir migration depuis la CLI canonique ; ne pas rejouer aveuglément d’anciennes migrations ni écraser données utilisateur.

**Humain / accès réellement nécessaires à la clôture :**
- Poste Windows/copie canonique : non connecté à Desktop Commander côté Codex. Claude local pourra tester et intégrer sans demander de nouvelle clé.
- iPhone/Android réel : routes micro/haut-parleur/écouteurs/Bluetooth, secousse, reprise arrière-plan, push, version réellement installée chez chaque testeur.
- App Store Connect : lire la soumission, son statut review et les accords éventuels ; un build TestFlight ne prouve pas l’acceptation App Store. Approbations contractuelles éventuelles par le titulaire.
- ACRCloud : dernier état constaté refuse Access Key ; vérifier hôte/projet/clé dans l’espace autorisé et tester un vrai échantillon. Ne pas supposer que toutes les API manquent et ne pas exposer les secrets. AudD/Stripe sont à qualifier avant achat/configuration, pas bloquants universels.
- Aucun accès humain requis pour le badge, les libellés ou la correction de logique ; leur blocage ici est uniquement l’environnement canonique de compilation/rendu.


### Codex — 08/10/2026 — QR explicite, catalogue et Apple : preuves et reste

**Nouveau code préparé, NON APPLIQUÉ / NON DÉPLOYÉ au produit**
- Patch `docs/patches/2026-10-08-qr-confirmation.patch` (9dc018e0) : popup avant toute approve, Approuver/Annuler, action serveur cancel authentifiée + preuve QR + WAITING conditionnel, refus des états déjà connectés, approve vérifie la ligne réellement modifiée pour ne pas annoncer succès après annulation concurrente, ordinateur affiche refus et propose un nouveau QR.
- Tests reproductibles : `docs/patches/2026-10-08-qr-server.test.cjs` et `2026-10-08-qr-popup.test.cjs`. Après application dans le poste canonique : `node docs/patches/2026-10-08-qr-server.test.cjs .` et `node docs/patches/2026-10-08-qr-popup.test.cjs .` (TypeScript installé au projet).
- Avant patch :4 scénarios serveur échouent,1 passe ; scan natif approuve immédiatement (test échoue). Après patch :5 scénarios serveur +2 scénarios popup passent. Vrai handler/composant transpillé avec frontière DB/Auth/RN simulée, aucune personne connectée pour le test. Syntaxe TS0 erreur, application du diff vérifiée par index Git temporaire ; pas de typecheck complet ni essai matériel.
- Ce patch ne couvre PAS encore le secret privé du navigateur initiateur, la notification persistante ouvrable dans l’application, la révocation Auth serveur ou l’anti-abus. Ne pas le présenter comme une sécurisation complète. Aucune notification envoyée ni session existante déconnectée. Déployer cancel côté serveur avant le client, tester compatibilité anciens clients et états expirés.
- L’API Alert du projet accepte la signature mais n’exploite pas cancelable : utiliser son comportement réel et tester retour Android/fermeture de la popup. Une fermeture ne doit jamais approuver ; vérifier que l’utilisateur peut rescanner et que le refus serveur est bien transmis.
- Continuer selon la demande d’Adel : demande retrouvable dans notifications, jamais de token/actionLink dans le push, approbation volontaire et refus/expiration atomiques. Réutiliser infrastructure notifications existante.

**Catalogue — lecture production après réparation précédente**
- Toujours0 titres classés avec preview pour LOFI, DRILL, GRIME, UK_GARAGE. MIX est un thème virtuel : son0 de mappings n’est PAS une panne catalogue.
- AMAPIANO13, BAILE_FUNK14, DUBSTEP15, PAGODE16, GOSPEL16, DNB21, AFROHOUSE35. Ce sont des URLs d’extrait présentes, pas des écoutes certifiées.
- Ne pas annoncer catalogue complet. Alimenter styles précis avec identité fournisseur vérifiée, mesurer disponibilité réelle des extraits et minimum d’artistes ; éviter fallback silencieux MIX et réinitialisation mémoire des utilisateurs.

**Apple — résultat actuel et limite précise**
- Accès App Store Connect tenté en lecture : redirection `/login?targetUrl=%2Fapps&authResult=FAILED`, aucun statut de l’app accessible ; pas de mot de passe/2FA manipulé. Clôturer avec Claude sur le compte autorisé (app6812393589).
- Script existant `verify-app-store-readiness.cjs` exécuté contre les blobs du HEAD distant sans modifier le clone : **79/79 contrôles statiques passent**. Ses lignes WAIT sont imprimées systématiquement ; ce n’est PAS une vérification que les secrets/API manquent réellement.
- Les mentions dans .context/PROJECT_STATE d’un ancien rejet lié à un achat externe et d’un build soumis TestFlight ne prouvent ni refus actuel ni acceptation publique.
- Claude : lire la version commerciale dans App Store Connect, build attaché, statut App Review et dernier message Resolution Center, accords éventuels, metadata/privacy/age/content/DSA et produits IAP liés. Rapporter texte exact du blocage + date + version avant correction. Ne pas acheter de nouvelle API ni refaire des identifiants déjà présents sur la seule base d’un ancien document.
