# KEEP — Déploiement iOS automatisé (EAS Build → TestFlight)

Dernière mise à jour : 2026-08-21.

## Ce qui est déjà prêt (fait, sans intervention propriétaire)

- `packages/mobile/app.json` : `bundleIdentifier` réel configuré
  (`com.adelkhatra.keep`), permissions micro déclarées, plugins
  `expo-build-properties`/`expo-image-picker` en place.
- `packages/mobile/assets/` : icône 1024×1024, icône adaptative Android,
  écran de démarrage, favicon — générés aux couleurs de marque KEEP
  (violet `#7C5CFC`, turquoise `#2DE1C2`), plus de placeholder manquant.
- `packages/mobile/eas.json` : profils `development`/`preview`/`production`
  configurés, `appVersionSource: remote` (EAS gère lui-même les numéros de
  build, aucune commande locale nécessaire), profil `submit.production`
  prêt à recevoir les deux seuls identifiants qui ne peuvent être connus
  qu'après l'inscription Apple (voir étape 2 ci-dessous).
- `.github/workflows/eas-build-ios.yml` : pipeline CI complet. À chaque push
  sur `main` touchant le code mobile, il installe les dépendances, lance
  `eas build --platform ios --non-interactive --no-wait --auto-submit`, et
  soumet automatiquement le build à TestFlight — **aucune commande à taper,
  aucune interaction humaine dans le flux normal**, une fois les secrets
  ci-dessous renseignés une seule fois.
- Le pipeline utilise l'authentification EAS par clé API App Store Connect
  (`ASC API Key`), ce qui évite tout `eas build` interactif local — EAS
  peut générer lui-même le certificat de distribution et le profil de
  provisioning côté serveur.

## Ce qui reste — 3 actions, toutes réservées à toi (identité/paiement/2FA)

Aucune de ces actions ne peut légalement ou techniquement être faite à ta
place. Après chacune, dis-moi "fait" et je continue immédiatement.

---

**ACTION REQUISE**
Service : Expo (compte EAS, gratuit)
Lien exact : https://expo.dev/signup
Ce que je dois faire :
1. Créer un compte (email + mot de passe, ou GitHub).
2. Aller dans Account settings → Access tokens → Create token, nommer le
   token `keep-ci`.
3. Ajouter ce token comme secret GitHub — **pas ici dans le chat** :
   sur `github.com/adelkhatra-bit/keep` → Settings → Secrets and variables
   → Actions → New repository secret → nom `EXPO_TOKEN`, valeur = le token
   copié à l'étape 2.

---

**ACTION REQUISE**
Service : Apple Developer Program
Lien exact : https://developer.apple.com/programs/enroll
Ce que je dois faire :
1. S'inscrire avec ton Apple ID personnel (99 $/an, identité + paiement +
   2FA — Apple ne délègue jamais cette étape).
2. Une fois le compte validé (24-48h en général), aller sur
   https://appstoreconnect.apple.com/access/api → générer une clé API
   "App Manager", télécharger le fichier `.p8` (téléchargeable **une seule
   fois**, à garder précieusement).
3. Ajouter 4 secrets GitHub (toujours via Settings → Secrets → Actions,
   jamais collés dans cette conversation) :
   - `ASC_API_KEY_P8_BASE64` = contenu du fichier `.p8` encodé en base64
     (sur macOS/Linux : `base64 -i AuthKey_XXXX.p8 | pbcopy` ou
     `base64 -w0 AuthKey_XXXX.p8`)
   - `ASC_KEY_ID` = l'identifiant de la clé (visible sur la page API Keys)
   - `ASC_ISSUER_ID` = l'Issuer ID (en haut de la même page)
   - `APPLE_TEAM_ID` = ton Team ID (Membership → Team ID sur
     developer.apple.com/account)

---

**ACTION REQUISE**
Service : App Store Connect (fiche app)
Lien exact : https://appstoreconnect.apple.com/apps → bouton "+"
Ce que je dois faire :
1. Créer la fiche app : nom "KEEP", langue principale français, bundle ID
   `com.adelkhatra.keep` (déjà réservé automatiquement s'il n'existe pas
   encore — sinon le créer d'abord dans Certificates, Identifiers &
   Profiles), SKU libre (ex. `keep-ios-001`).
2. Accepter les accords/contrats bancaires si demandés par Apple (étape
   propre à ton compte, obligatoire même pour TestFlight interne).
3. Me communiquer l'"Apple ID" numérique de l'app (visible en haut de la
   fiche App Store Connect, ex. `1234567890`) — ce n'est pas un secret, tu
   peux me le donner directement dans le chat. Je l'inscrirai dans
   `eas.json` (`submit.production.ios.ascAppId`) à ta place.

---

## Ce qui se passera automatiquement une fois ces 3 actions faites

Dès que les secrets `EXPO_TOKEN`, `ASC_API_KEY_P8_BASE64`, `ASC_KEY_ID`,
`ASC_ISSUER_ID`, `APPLE_TEAM_ID` existent dans GitHub et que le dépôt est
poussable (voir blocage séparé ci-dessous), chaque `git push` sur `main`
déclenche automatiquement : build iOS → build number auto-incrémenté →
soumission TestFlight → build visible dans l'app TestFlight sur ton iPhone
après le traitement Apple (généralement quelques minutes à ~1h). Tu n'auras
plus jamais à taper une commande.

Tu peux aussi déclencher un build à la demande sans attendre un push :
onglet "Actions" du dépôt GitHub → "KEEP — Build iOS (EAS) + TestFlight" →
"Run workflow".

## Blocage indépendant, déjà documenté ailleurs

Le push de ce commit (et donc le premier déclenchement réel de ce workflow)
dépend aussi du déblocage de l'accès push GitHub pour cette session — voir
`docs/PROJECT_STATUS.md` section BLOCKED / ACTION UTILISATEUR REQUISE §1.
Ce blocage est indépendant d'Apple : c'est un réglage de session
Coword/Claude, pas une action Apple.

## Frein pour la revue TestFlight externe (à anticiper, pas bloquant maintenant)

Le testing **interne** (jusqu'à 100 testeurs, comptes ayant un rôle sur
App Store Connect) part sans revue Apple. Le testing **externe** (lien
public, jusqu'à 10 000 testeurs) déclenche une revue Beta App Review
(généralement <24h) — prévoir une note de review expliquant que KEEP ne
diffuse aucun contenu musical lui-même mais route vers Apple
Music/Spotify déjà installés (cf. `docs/PLATFORM_COMPLIANCE.md`,
Guideline 4.2.2), pour éviter un rejet par confusion avec une app de
streaming.
