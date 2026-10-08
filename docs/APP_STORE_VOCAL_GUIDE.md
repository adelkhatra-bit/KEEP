# Guide vocal — Publier Loki Music sur l'App Store

> Objectif : soumettre **Loki Music v1.0.0 (build 312, déjà sur TestFlight)** à la review Apple.
> Tout le texte de la fiche est déjà prêt (voir plus bas). Deux chemins : **A (automatique, je le fais)** et **B (toi sur iPhone, 100% fiable).**

---

## ⭐ Résumé en 1 phrase

Le build est prêt et sur TestFlight ; il ne reste qu'à **remplir la fiche App Store et cliquer « Soumettre »**. Le seul élément que seul le titulaire du compte Apple peut produire est **une preuve d'identité Apple** (mot de passe d'app OU les clics finaux dans App Store Connect).

---

## CHEMIN 0 — 100% autonome (aucune saisie, aucun mot de passe) ⭐ RECOMMANDÉ

La clé API App Store Connect (`.p8`) qui a **déjà produit le build 312** est présente dans les
**GitHub Secrets** (`ASC_API_KEY_P8_BASE64` + `ASC_KEY_ID` + `ASC_ISSUER_ID`). Avec elle, la
soumission est **entièrement automatique** — via le workflow `app-store-submit.yml` (livré en
`docs/ci/app-store-submit-workflow.patch`) ou le script `scripts/publish-app-store.sh submit`.

**Blocage actuel** : le connecteur GitHub (App abacusai) n'a ni la permission **« Workflows »**
(pousser un workflow refusé) ni **« Actions »** (le déclencher refusé), et ne peut pas lire les
Secrets. Il ne peut donc ni installer ce workflow ni le lancer.

**La SEULE action à faire une fois (≈ 20 s, un seul réglage)** :
1. Ouvre **https://github.com/apps/abacusai/installations/select_target**
2. Choisis le dépôt **KEEP** → **« Repository permissions »**
3. Passe **« Workflows »** et **« Actions »** en **Read and write** → **Save**.

**Texte vocal à dicter (si on te demande) :** « Autoriser l'application Abacus AI à écrire les
workflows et les actions sur le dépôt KEEP. »

**Résultat attendu** : je pousse `app-store-submit.yml`, je le lance, la fiche est remplie et la
v1.0.0 (build 312) est soumise à la review — **sans que tu touches à rien d'autre**.

> Tant que cette permission n'est pas accordée, utilise le Chemin A ou B ci-dessous.

---

## CHEMIN A — Automatique (je remplis + je soumets à ta place)

Tu fais **une seule chose** (≈ 30 secondes), le reste est automatisé par le script `scripts/publish-app-store.sh`.

1. Sur iPhone, ouvre **appleid.apple.com** → connecte-toi.
2. Va dans **« Connexion et sécurité »** → **« Mots de passe des apps »**.
3. Appuie sur **« + »** (ou « Générer un mot de passe pour une app »).
4. Nomme-le **`Loki-Final`** → valide.
5. Apple affiche un code type **`abcd-efgh-ijkl-mnop`**. **Dicte-le moi** (ainsi que ton **Apple ID / email**).
6. Je lance `fastlane ios submit` avec ces identifiants → fiche remplie + soumission review. Je te donne le résultat.

> Aucun `.p8` requis. Le mot de passe d'app n'est **pas** stocké dans le repo ; il n'est utilisé que le temps du run.
> ⚠️ Si Apple bloque une connexion venant d'un serveur (IP inhabituelle), on bascule automatiquement sur le **Chemin B** ci-dessous — même résultat.

---

## CHEMIN B — Toi sur iPhone (100% fiable, aucun secret à partager)

Tu recopies/dictes le texte déjà prêt (section « Textes à coller » plus bas). 12 étapes.

1. Ouvre **appstoreconnect.apple.com** (Safari) → connecte-toi.
2. **Mes apps** → **Loki Music**.
3. Menu de gauche → la version **1.0.0 Prête à soumettre**.
4. **Nom** : `Loki Music` — **Sous-titre** : `Reconnais. Garde. Partage.`
5. **Description** : colle le bloc « Description » (section plus bas).
6. **Nouveautés** : colle le bloc « Nouveautés ».
7. **Mots-clés** : `musique,reconnaissance,playlist,profil,decouverte,artiste,morceau,soiree,amis,keep`
8. **URL d'assistance** : `https://adelkhatra-bit.github.io/KEEP/support/` — **URL marketing** : `https://adelkhatra-bit.github.io/KEEP/`
9. **Copyright** : `© 2026 Adel Khatra` — **Coordonnées** : ton nom, email, téléphone.
10. **Captures d'écran (6,5")** : ajoute la capture fournie (`packages/mobile/fastlane/screenshots/fr-FR/`). Une seule suffit pour soumettre.
11. **Droits de contenu** : coche « contient du contenu tiers » + « je dispose des droits ». **Chiffrement** : « n'utilise pas de chiffrement non exempté ».
12. **Game Center** : si Apple signale l'entitlement `com.apple.developer.game-center`, va dans l'onglet **App Information** et **désactive Game Center** (Loki Music ne l'utilise pas). Puis **« Ajouter pour la review »** → **« Soumettre »**.

✅ Terminé. Statut passe à **« En attente de review »**.

---

## Textes à coller (identiques à ceux du script)

**Nom** : Loki Music
**Sous-titre** : Reconnais. Garde. Partage.
**Mots-clés** : musique,reconnaissance,playlist,profil,decouverte,artiste,morceau,soiree,amis,keep
**URL marketing** : https://adelkhatra-bit.github.io/KEEP/
**URL d'assistance** : https://adelkhatra-bit.github.io/KEEP/support/
**URL confidentialité** : https://adelkhatra-bit.github.io/KEEP/privacy/
**Copyright** : © 2026 Adel Khatra

**Description** : voir `packages/mobile/fastlane/metadata/fr-FR/description.txt`

**Nouveautés** : Première version de Loki Music : reconnaissance musicale, GARDER/PASSER, playlists, Loki Music DNA, profils musicaux, partage social et réglages de confidentialité.

---

## Notes pour la review Apple (à coller dans « Notes »)

Voir `packages/mobile/fastlane/metadata/review_information/notes.txt`.
Point clé : **aucun achat de bien numérique externe n'est actif** dans ce build (marketplace désactivée par flag), donc pas de conflit avec la règle 3.1.1 d'Apple.

---

## Identifiants Apple (déjà connus, pour référence)

- Team ID : `WTG9399DBK`
- App ID : `6812393589`
- Bundle ID : `com.adelkhatra.keep`
- Issuer ID : `bf75c204-8876-4c83-a84a-52b7e7a5b2c3`
- Build soumis : **312** — Version : **1.0.0**
