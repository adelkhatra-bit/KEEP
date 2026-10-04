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
