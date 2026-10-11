# Audit notifications téléphone (app fermée) — 06/10/2026

Lecture seule du code + lectures SQL de contrôle (aucune écriture). Statuts : PRÉSENT / ABSENT / CASSÉ.

## 1. Maillons de la chaîne

| Maillon | Statut | Preuve |
|---|---|---|
| Plugin `expo-notifications` + son embarqué | PRÉSENT (1 seul son) | `packages/mobile/app.json:74-79` : `sounds: ["./assets/keep_money.wav"]` |
| Fichier audio | PRÉSENT mais très faible : WAV 8 kHz mono 16 bit, 1 644 octets (~0,1 s) | `packages/mobile/assets/keep_money.wav` (seul fichier audio du dossier assets) ; généré par `scripts/generate-notification-sounds.cjs:49` |
| Sons débit / pièces multiples / notif standard | ABSENT | aucun autre `.wav/.mp3/.caf` ; `notificationCueService.ts` et `notificationSoundService.ts` rejouent tous deux `keep_money.wav` (DEFAULT = même fichier accéléré x1,24) |
| Entitlement APNs | PRÉSENT | `app.json:28` `aps-environment: production` ; `UIBackgroundModes: ["audio"]` (l.24) — pas de `remote-notification` mais non requis pour une push d'alerte |
| Permission Android | PRÉSENT | `app.json:42` `POST_NOTIFICATIONS` |
| Canaux Android | PRÉSENT | `pushNotificationService.ts:~395-408` : `default` (HIGH, son default), `money` (MAX, `keep_money.wav`, vibration). Pas de canal débit/social/battle |
| `google-services.json` / FCM Android | ABSENT | aucun `google-services.json` versionné (`git ls-files`), aucune clé `android.googleServicesFile` dans `app.json`, aucun workflow d'audit de credentials Android (les audits `eas-push-*` et `ios-push-*` ne couvrent que iOS). Sans FCM, `getExpoPushTokenAsync` échoue sur Android |
| Demande de permission | PRÉSENT | `pushNotificationService.ts:380-410` (`requestPermissionsAsync`), appelée par `PushRegistrationLifecycle.tsx` (monté dans `packages/mobile/index.js`) et `App.tsx:260` |
| Token Expo (projectId) | PRÉSENT | `app.json:87` projectId `f9598ced-...` ; lu via `expoProjectId()`; refus simulateur `Device.isDevice` (l.~386) |
| Handler premier plan | PRÉSENT, voulu | `setNotificationHandler` : tout à `false` (pas de son/bannière système app ouverte, la bannière interne prend le relais) — n'affecte pas l'app fermée |
| Enregistrement serveur | PRÉSENT | RPC `keep_push_token_register_v3` (migrations `20261004001000`, `20261004131456`), table `push_tokens` |
| Envoi serveur | PRÉSENT | Edge function `supabase/functions/keep-push-worker/index.ts` : API Expo `https://exp.host/--/api/v2/push/send` (l.~14), reçus, nettoyage tokens |
| Déclenchement | PRÉSENT | cron 30 s `20260830014500_keep_push_worker_cron.sql:59-72` (1 job actif en prod, vérifié) ; trigger "instant kick" `20261005050000_push_cap_and_instant_kick.sql` (selon ledger ERR-PUSH-STATUS-089 : NON posé en prod) |
| Création des notifications | PRÉSENT | triggers/RPC SQL, ex. vente FREE : `20260924163120_playlist_sale_free_mode.sql:622` (`PLAYLIST_SALE_COMPLETED`, titre "⚡ FREE reçus", vendeur) et `:641` (`PLAYLIST_SALE_DELIVERED`, acheteur) |
| Son choisi côté serveur | PARTIEL | worker `deliveryPreference()` : seulement `keep_money.wav` ou `default`, canal `money`/`default`. Money = `soundKind=money` ou event `PLAYLIST_SALE_COMPLETED`/`EVENT_TICKET_SALE_COMPLETED` |
| Débit acheteur FREE | CASSÉ/ABSENT | `PLAYLIST_SALE_DELIVERED` tombe en catégorie `system` => son `default`, aucun son "perte". Aucun type de notif "débit FREE" dédié |
| Crédit FREE (`FREE_CREDITED`, `FREE_CREDIT_REWARD`) | CASSÉ pour le téléphone | listés dans `IN_APP_ONLY_NOTIFICATION_TYPES` (`keep-push-worker/index.ts:~22-23`) : jamais envoyés en push |
| Web / service worker | ABSENT | aucun service worker (seule mention dans `scripts/fix-web-export.cjs`, pas d'enregistrement) ; web = bannière interne + WebAudio (`notificationCueService`) uniquement, pas de Web Push |
| Notifs locales | PARTIEL | `notifyDetectedTrack` (local, app ouverte/arrière-plan audio) ; sons in-app via `expo-av`, inopérants app fermée |

## 2. Lecture de la production (SELECT uniquement, 06/10)

- `push_tokens` : **1 seul token (iOS)**, aucun Android. Dernière MAJ 05/10 23:55 UTC.
- 7 derniers jours, `notifications.push_delivery_status` : NO_DEVICE 309, IN_APP_ONLY 49, FAILED 36, DELIVERED 2.
- `push_delivery_attempts` : 18 FAILED = APNs `BadEnvironmentKeyInToken` (dernier 04/10 14:34), 2 DELIVERED (SYSTEM_TEST). => la chaîne Expo/APNs est prouvée de bout en bout après correction ; des push arrivent quand un token valide existe.
- `client_diagnostics` area `push_registration` : **`permission_denied` x20 (iOS, dernier 05/10 16:25)**, `register_rpc_error` x2 (05/10 21:09), `expo_token_rotation_error` x1.
- Pour le propriétaire du token : `FREE_CREDITED`/`FREE_CREDIT_REWARD` = FAILED (anciens, BadEnvironment) ou NO_DEVICE ; ils sont de toute façon IN_APP_ONLY dans le worker actuel.

## 3. Causes classées par probabilité

| # | Cause | Probabilité | Preuve |
|---|---|---|---|
| 1 | Permission notifications refusée dans iOS (Réglages) : l'app ne peut plus la redemander | Très haute | 20 `permission_denied` iOS, dernier 05/10 |
| 2 | Aucun token pour la plupart des profils (vendeurs/acheteurs hors le seul iPhone) : le serveur n'a personne à joindre | Très haute | 1 token pour tout le projet ; 309 `NO_DEVICE` |
| 3 | Android : FCM/google-services absent, donc aucun token Android possible | Haute (Samsung) | aucun token android ; pas de `googleServicesFile` |
| 4 | Types FREE (crédit) exclus de la push (`IN_APP_ONLY`) et débit sans type/son dédié | Haute pour "pas de son quand je vends/achète en FREE" | `keep-push-worker/index.ts` liste IN_APP_ONLY ; SQL `PLAYLIST_SALE_DELIVERED` |
| 5 | Erreur `register_rpc_error` à l'enregistrement (RPC `keep_push_token_register_v3`) sur certains appareils | Moyenne | 2 diagnostics 05/10 21:09 (message exact à lire dans `client_diagnostics`) |
| 6 | Historique BadEnvironmentKeyInToken (clé APNs / environnement) | Faible aujourd'hui (corrigé, 2 DELIVERED) | 18 FAILED jusqu'au 04/10 14:34 |
| 7 | Son unique de 0,1 s à 8 kHz, quasi inaudible/identique partout ; son `default` pour tout le reste | Moyenne (qualité) | `keep_money.wav` 1 644 octets |
| 8 | Trigger "instant kick" non posé : latence jusqu'à 30 s | Faible | ledger ERR-089 |
| 9 | Web : pas de Web Push | Certaine mais hors périmètre mobile | pas de service worker |

## 4. Corrections ordonnées

**OTA (JS seul, `eas update`) — mais un nouveau son natif n'est pris qu'après build**
1. `pushNotificationService.ts` : si `permission_denied` sur iOS, afficher un écran/bandeau "Ouvrir Réglages" (`Linking.openSettings()`), et re-tenter l'enregistrement au retour au premier plan (déjà en place via AppState). Lire le message exact de `register_rpc_error` dans `client_diagnostics`.
2. Demander la permission au bon moment (après connexion, avec explication) plutôt qu'en arrière-plan silencieux : `PushRegistrationLifecycle.tsx`, `App.tsx:260`.
3. `notificationService.ts` / `notificationCueService.ts` / `notificationSoundService.ts` : choisir le fichier selon CREDIT / DEBIT / DEFAULT (aujourd'hui tous = `keep_money.wav`), variation aléatoire entre 3 sons.
4. Réglages notifications (`NotificationPreferences`) : sons crédit/débit/standard.

**Serveur Edge/SQL (déploiement = accord explicite d'Adel requis, règle prod)**
5. `keep-push-worker/index.ts` : retirer `FREE_CREDITED`/`FREE_CREDIT_REWARD` de `IN_APP_ONLY` pour les ventes ; nouvelle catégorie `credit`/`debit` ; `sound` = `keep_coin_1..3.wav` ou `keep_loss_1..3.wav` (tirage aléatoire), `channelId` dédié ; exemptés du plafond comme `money`.
6. Migration SQL : `PLAYLIST_SALE_DELIVERED` (acheteur) -> `data.soundKind='debit'` ; `PLAYLIST_SALE_COMPLETED` (vendeur) -> `soundKind='credit'`. Poser le trigger instant kick.
7. `notification_preferences` : colonnes/valeurs de son crédit/débit.

**Build natif obligatoire (`eas build` + TestFlight/Android)**
8. `app.json` plugin `expo-notifications` : ajouter tous les nouveaux fichiers dans `sounds` (iOS les embarque à la compilation ; sinon la push joue le son par défaut) ; icône/couleur Android de notification.
9. `app.json` Android : `android.googleServicesFile` + `google-services.json` du projet Firebase (package `com.adelkhatra.keep`) ; canaux Android `credit`, `debit` créés au démarrage (les sons de canal Android sont figés à la création : utiliser de nouveaux ids de canal, ex. `credit_v2`).
10. Ajouter `remote-notification` à `UIBackgroundModes` (recommandé pour les push silencieuses/réveil).

**Web (optionnel, plus tard)** : service worker + Web Push (VAPID) — non prioritaire.

## 5. Ce qu'Adel doit faire lui-même

- iPhone : Réglages > Notifications > Loki Music > Autoriser + Sons ; vérifier que Ne pas déranger/Concentration est coupé. Si la permission est refusée, désinstaller/réinstaller l'app réinitialise la question.
- Clé APNs : vérifier dans Expo (expo.dev > projet > Credentials > iOS) qu'une clé push APNs (.p8) valide est liée à `com.adelkhatra.keep`, équipe `WTG9399DBK` (le workflow `eas-push-credential-audit.yml` le contrôle). Si doute : `eas credentials` > Push Key > régénérer.
- Android/FCM : créer un projet Firebase, ajouter l'app Android `com.adelkhatra.keep`, télécharger `google-services.json`, créer une clé de compte de service FCM V1 et la téléverser dans Expo (Credentials > Android > FCM V1 service account key). Me transmettre `google-services.json` (non secret) pour l'intégrer ; la clé de service ne doit jamais être mise dans le dépôt.
- Valider les sons proposés ci-dessous, et autoriser le déploiement de l'edge function et des migrations (règle "pas d'écriture prod sans accord").
- Après build : se connecter sur chaque téléphone (iPhone et Samsung) pour créer son token, puis tester app fermée.

## 6. Cahier de sons proposé

Format : iOS = `.wav` PCM 16 bit (ou `.caf`/`.aiff`), 44,1 kHz, mono ; < 30 s imposé par iOS (au-delà, iOS joue le son par défaut) ; recommandé 0,8 à 2,5 s. Android : même `.wav` (nom en minuscules, chiffres et `_` uniquement, sans tiret) ; sons de canal figés à la création. Normalisation environ -3 dBFS, fondu de sortie de 30 ms pour éviter les clics.

| Usage | Fichier | Durée conseillée | Description |
|---|---|---|---|
| Crédit 1 | `keep_coin_1.wav` | ~1,2 s | pièce unique qui tinte |
| Crédit 2 | `keep_coin_2.wav` | ~1,8 s | petite pluie de 3-4 pièces |
| Crédit 3 | `keep_coin_3.wav` | ~2,5 s | tiroir-caisse + cascade de pièces (grosse vente) |
| Débit 1 | `keep_loss_1.wav` | ~1,0 s | pièce qui tombe, ton descendant |
| Débit 2 | `keep_loss_2.wav` | ~1,5 s | "bloup" de portefeuille qui se vide |
| Débit 3 | `keep_loss_3.wav` | ~2,0 s | notes descendantes douces façon jeu ("wah-wah" léger) |
| Notification standard | `keep_notify.wav` | ~0,8 s | ding doux, distinct des pièces |

Remplacer aussi l'actuel `keep_money.wav` (0,1 s, 8 kHz) ou le conserver en alias de `keep_coin_1.wav` pour compatibilité avec les anciennes push. Nommage serveur : `sound: "keep_coin_2.wav"` et `channelId: "credit_v2"`.
