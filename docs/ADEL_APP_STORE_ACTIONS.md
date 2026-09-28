# ACTIONS ADEL — App Store Deployment — 28 septembre 2026

**Objectif** : Préparer et soumettre Loki Music sur l'App Store.  
**Durée totale** : ~2 semaines (3 jours actions Adel + 4 jours build + 1–5 jours review).  
**Statut actuel** : Codebase 100% prêt. En attente d'actions humaines.

---

## 📋 CHECKLIST ACTIONS BLOQUANTES (Avant soumission)

### JOUR 1 — Apple Developer & Secrets (2h30)

- [ ] **10h00 — Adhésion Apple Developer**
  - Aller sur https://developer.apple.com/enroll/
  - Payer $99/an
  - Valider identité (document d'identité)
  - Durée : 30–45 min
  - **Status** : Adhésion active

- [ ] **10h45 — Générer clé App Store Connect API**
  - Developer portal → Keys → Generate a new key
  - Permissions : `App Manager` (minimum pour soumettre)
  - Type : API Key (créer un P-8 principal)
  - Télécharger fichier `.p8` → le garder sécurisé
  - Noter : `Issuer ID`, `Key ID`
  - Durée : 5 min
  - **Status** : Fichier `.p8` + 2 IDs en main

- [ ] **10h50 — Configurer GitHub Secrets (App abacusai)**
  - Aller sur https://github.com/adelkhatra-bit/KEEP → Settings → Secrets and variables → Actions
  - Ajouter 5 secrets (copier/coller exact) :
    - `EXPO_TOKEN` : Ton token Expo (générer ici: https://expo.dev/settings/access-tokens)
    - `APPLE_TEAM_ID` : `WTG9399DBK` (que tu as)
    - `ASC_APP_ID` : `6812393589` (que tu as)
    - `ASC_KEY_ID` : Depuis le Key ID ci-dessus
    - `ASC_ISSUER_ID` : Depuis l'Issuer ID ci-dessus
    - `ASC_API_KEY_P8_BASE64` : Contenu du fichier `.p8` encodé en base64
      ```bash
      # Pour encoder le .p8 :
      cat /chemin/vers/AuthKey_XXX.p8 | base64
      # Copier le texte complet (multilignes OK)
      ```
  - Durée : 15 min
  - **Status** : 5 secrets créés dans GitHub

- [ ] **11h05 — Créer 3 produits IAP**
  - Aller sur https://appstoreconnect.apple.com/apps/6812393589
  - Onglet : App Information → In-App Purchases
  - Cliquer : "+ Create In-App Purchase"
  - Créer 3 produits identiques au template ci-dessous :

  **Produit 1 : Premium Monthly**
  - Product ID : `com.adelkhatra.keep.premium.monthly`
  - Type : Auto-Renewing Subscription
  - Reference Name : `Premium Monthly`
  - Billing Frequency : Monthly
  - Price Tier : Tier 1 ($0.99 USD) — ou autre au choix
  - Renewal Type : Renews automatically
  - Cancellation Reason : Configurable in app
  - Localization (French) :
    - Name: `Loki Music Premium`
    - Description: `Débloquez les fonctionnalités premium de Loki Music`
  - Submit for review ✅
  
  **Produit 2 : Creator Pro Monthly**
  - Product ID : `com.adelkhatra.keep.creatorpro.monthly`
  - (même paramètres, nom « Creator Pro »)
  - Price Tier : Tier 2 ($4.99 USD) — ou au choix
  
  **Produit 3 : Venue Pro Monthly**
  - Product ID : `com.adelkhatra.keep.venuepro.monthly`
  - (même paramètres, nom « Venue Pro »)
  - Price Tier : Tier 2 ($4.99 USD) — ou au choix

  - Durée : 20 min
  - **Status** : 3 produits créés et soumis

---

### JOUR 2 — Apple IAP Secrets & Stripe (1h30)

- [ ] **09h00 — Récupérer clé Apple IAP (StoreKit)**
  - Developer portal → Identifiers → App IDs → `com.adelkhatra.keep`
  - Onglet : Capabilities → In-App Purchase (vérifier activé) ✅
  - Onglet : Keys → Créer une nouvelle clé « StoreKit API Key »
  - Type : In-App Purchase
  - Download la clé `.p8` → la garder
  - Noter : `Key ID` + `Issuer ID` (sera différent du premier)
  - Durée : 10 min
  - **Status** : `.p8` IAP + 2 IDs en main

- [ ] **09h10 — Configurer secrets Apple IAP en Supabase**
  - Aller sur https://supabase.com/dashboard/project/rrhqsqzcplvmwxizqnla → SQL Editor
  - Exécuter cette commande (remplacer `<...>` par valeurs réelles) :

  ```sql
  INSERT INTO vault.secrets (name, secret) VALUES
    ('APPLE_IAP_ISSUER_ID', '<issuer-id-de-la-cle-iap>'),
    ('APPLE_IAP_KEY_ID', '<key-id-de-la-cle-iap>'),
    ('APPLE_IAP_PRIVATE_KEY', '<contenu-complet-du-fichier-.p8>');
  ```

  - Vérifier :
  ```sql
  SELECT name FROM vault.secrets WHERE name LIKE 'APPLE_IAP%';
  -- Doit retourner 3 lignes
  ```
  - Durée : 10 min
  - **Status** : 3 secrets IAP en Supabase ✅

- [ ] **09h20 — Corriger clés Stripe en Supabase**
  - Aller sur https://supabase.com/dashboard/project/rrhqsqzcplvmwxizqnla → SQL Editor
  - Vérifier quelle clé est en place :

  ```sql
  SELECT name, secret FROM vault.secrets 
  WHERE name IN ('STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY');
  ```

  - Si `STRIPE_SECRET_KEY` commence par `pk_` (❌ publique) :

  ```sql
  -- Récupérer ta vraie clé secrète depuis https://dashboard.stripe.com/apikeys
  UPDATE vault.secrets 
  SET secret = '<clé-sk_...>' 
  WHERE name = 'STRIPE_SECRET_KEY';
  ```

  - Vérifier qu'il y a aussi une `STRIPE_PUBLISHABLE_KEY` (clé `pk_`) :

  ```sql
  INSERT INTO vault.secrets (name, secret) VALUES
    ('STRIPE_PUBLISHABLE_KEY', '<pk_...>')
  ON CONFLICT(name) DO UPDATE SET secret = EXCLUDED.secret;
  ```

  - Durée : 15 min
  - **Status** : Clés Stripe corrigées ✅

---

### JOUR 2 — Screenshots & Métadonnées (90 min)

- [ ] **10h00 — Préparer 6 screenshots App Store**

  **Option A : Device réel ou simulator**
  - Simulator iOS 18 → Run app → Prendre screenshots
  - Ou device réel après TestFlight (jour 4–5)

  **Option B : Mockup rapide (figma.com ou Adobe XD)**
  - Template : 1170×2532 px (iPhone 6.5")
  - 6 vues : Écouter, Découvertes, Playlists, Soirées, Profil, Onboarding

  **Tailles à uploader** :
  - iPhone 6.7" (1290×2796)
  - iPhone 6.5" (1170×2532)
  - iPhone 5.5" (1242×2208)
  - iPad 12.9" (2732×2048) — optionnel car `supportsTablet = false`

  - Durée : 60 min
  - **Status** : 6 screenshots prêts (PNG 1–3 MB chacun)

- [ ] **11h00 — Remplir métadonnées App Store Connect**

  Aller sur https://appstoreconnect.apple.com/apps/6812393589 → Onglet Information

  - **Nom** : `Loki Music` (déjà bon)
  - **Sous-titre** (~30 caractères) : `Reconnaissance & réseau social` OU `Reconnaitre, garder, partager`
  - **Description (FR)** (~4000 car max) : Copier depuis le bloc ci-dessous

  ```
  Loki Music identifie les morceaux joués autour de vous (microphone) 
  ou partagés depuis d'autres apps, et les garde dans une bibliothèque 
  personnelle organisée automatiquement par style musical.

  Chaque utilisateur a un profil public consultable par les autres, 
  avec ses morceaux gardés, ses abonnés, et un système attribuant 
  à chaque morceau son « premier découvreur » dans le réseau social.

  Essayez gratuitement : 3 identifications sans création de compte. 
  Convertissez à un compte réel (pseudo + e-mail + mot de passe) 
  au moment que vous choisirez. Zéro engagement.

  FONCTIONNALITÉS
  • Reconnaissance musicale par microphone (permission demandée)
  • Bibliothèque automatiquement triée par style
  • Réseau social : profil public, abonnés, « premiers découvreurs »
  • Swipe continu de découvertes
  • Playlists personnelles
  • Mode Soirées (Battle musical direct)
  • Entièrement gratuit pour l'essai ; abonnements optionnels

  VOS DONNÉES, VOTRE CHOIX
  • 100% gratuit pour l'essai (3 identifications)
  • Zéro publicité
  • Zéro suivi analytique cross-app
  • Politique de confidentialité transparente

  VERSION : 1.0.0
  ```

  - **Mots-clés (FR)** : `musique, reconnaissance, shazam, playlist, social, battle`
  - **Support URL** : https://adelkhatra-bit.github.io/KEEP/support/
  - **Support Email** : contact@lokimusic.com (OU adresse perso Adel)
  - **Marketing URL** : (optionnel — laisser vide ou → https://adelkhatra-bit.github.io/KEEP/)
  - **Privacy Policy URL** : https://adelkhatra-bit.github.io/KEEP/privacy/

  - Durée : 30 min
  - **Status** : Métadonnées remplies FR

- [ ] **11h30 — Version anglaise (copier-coller traduit)**
  - Répéter les 5 champs ci-dessus en EN
  - Sous-titre EN : `Music Recognition & Social Network`
  - Description EN : Traduction de la description FR
  - Mots-clés EN : `music, recognition, shazam, playlist, social, battle, games`
  - Durée : 15 min
  - **Status** : Métadonnées remplies EN

---

### JOUR 3 — Compte Test & Device Validation (30 min)

- [ ] **09h00 — Créer compte de test Loki Music**
  - Lancer l'app (web ou simulator)
  - Cliquer : « Créer mon compte »
  - Pseudo : `test_reviewer` (ou `reviewer_loki_test_xxxx`)
  - E-mail : `test+loki@<ton-domaine>` (reçoit les confirmations)
  - Mot de passe : Générer un fort (`MyTestPass2026!@#`)
  - Confirmer via lien e-mail
  - Durée : 10 min
  - **Status** : Compte créé + e-mail confirmé

- [ ] **09h10 — Tester sur device réel (5 min microphone)**
  - Installer TestFlight sur iPhone (depuis App Store)
  - Joindre le groupe de test interne (si build EAS déjà en TestFlight)
  - OU attendre day 4 après build
  - Ouvrir Loki Music
  - Appuyer : Onglet Écouter → « Écouter »
  - Permettre microphone
  - Jouer 5 morceaux (vidéo YouTube sur haut-parleur) → GARDER
  - Vérifier aucun crash
  - Vérifier Play Library affiche les 5 morceaux
  - Durée : 5 min
  - **Status** : ✅ Pas de crash, microphone ✅

- [ ] **09h15 — Tester notifications (optionnel)**
  - Onglet Profil → Paramètres → Notifications → Activer
  - Créer un profil à partir d'un autre compte
  - Suivre ce profil depuis le compte test
  - Vérifier notification reçue dans les 10 secondes
  - Durée : 5 min (optionnel)

---

### JOUR 3 — App Review Notes (10 min)

- [ ] **09h30 — Compléter APP_STORE_REVIEW_NOTES.md**
  - Fichier : `docs/APP_STORE_REVIEW_NOTES.md`
  - Remplir la section vide : « Compte de test reviewer »

  ```markdown
  ## Compte de test reviewer

  Username : `test_reviewer`
  Password : `MyTestPass2026!@#`
  ```

  - Durée : 5 min
  - **Status** : Notes complétées

---

## 📱 JOUR 4–5 — Déclencher Build iOS (GitHub Actions)

- [ ] **Jour 4, 14h00 — Déclencher workflow iOS**
  - Aller sur https://github.com/adelkhatra-bit/KEEP/actions
  - Cliquer : Workflows → « 🚀 Auto EAS Build iOS Production »
  - Bouton : « Run workflow »
  - Profile : `production` (sélectionné par défaut)
  - Cliquer : « Run workflow »
  - Durée : 1 min
  - **Status** : Build lancé

- [ ] **Jour 4–5, 14h30–17h00 — Attendre build**
  - Build sur macOS GitHub Actions (gratuit, 30–60 min)
  - Suivre le log en direct
  - En cas d'erreur :
    - Vérifier logs GitHub Actions
    - Vérifier tous les secrets sont bien configurés
    - Contacter support EAS si bloqué
  - **Status** : Build ✅ OU ❌ (si erreur, itérer)

- [ ] **Jour 5 matin — Vérifier TestFlight submission**
  - App Store Connect → TestFlight
  - Vérifier build `1.0.0 (312)` disponible
  - Status : « Ready to Submit » OU « Missing Info »
  - Si missing info : suivre guide Apple (généralement age rating + content rights)
  - Durée : 5 min
  - **Status** : Build en TestFlight

---

## 🎯 JOUR 5–7 — App Store Submission (5 min)

- [ ] **Jour 5, après-midi — Finalisations dans App Store Connect**
  - App Information → General
  - Vérifier : Screenshots, métadonnées, support URL ✅
  - Age Ratings → Sélectionner profil (17+ pour microphone) ✅
  - Content Rights → Confirmer pas de contenu tiers sans droits ✅
  - (DSA/Trader info optionnel pour now — Adel pas e-commerce)
  - Durée : 10 min

- [ ] **Jour 5, soir — Soumettre à Apple**
  - Aller sur https://appstoreconnect.apple.com/apps/6812393589 → Pricing & Availability
  - Cliquer : « Add Version for Review »
  - Vérifier tous les checkmarks ✅
  - Cliquer : « Submit for Review »
  - Durée : 1 min
  - **Status** : 🚀 SOUMIS à Apple

- [ ] **Jour 5–7 — Attendre Apple review**
  - Checker e-mail + App Store Connect tous les jours
  - Temps moyen : 24–48h
  - Apple peut poser questions (répond dans App Store Connect)
  - Status possible : « Approved ✅ » OU « Rejected ❌ » (rare si audit bon)

---

## ✅ JOUR 7–8 — Approval & Release (1 min)

- [ ] **Jour 7–8 (selon approbation Apple) — Release on App Store**
  - App Store Connect → Pricing & Availability
  - Cliquer : « Release this Version »
  - Sélectionner : « Release immediately » (OU attendre date choisie)
  - Cliquer : « Release »
  - Durée : 1 min
  - **Status** : 🎉 LIVE sur App Store (24–48h avant visible mondialement)

---

## 🎲 OPTIONAL — Actions non-bloquantes (Post-approval)

Après approbation iOS (Q4 2026), prévoir :

- [ ] **Google Play Developer** (2 semaines)
  - Créer compte Google Play Developer ($25)
  - Créer 3 produits IAP identiques
  - Build et soumettre Android
  
- [ ] **Paddle (Web payments)** (À déterminer)
  - Intégrer SDK Paddle si ventes web
  - Configurer webhooks

---

## 📊 TIMELINE RÉSUMÉE

| Jour | Durée | Action | Personne | Status |
|---|---|---|---|---|
| 1 | 2h30 | Adhésion Apple + secrets + 3 IAP | Adel | À faire |
| 2 | 1h30 | Secrets IAP + Stripe | Adel | À faire |
| 2 | 90min | Screenshots + métadonnées | Adel | À faire |
| 3 | 30min | Compte test + device validation | Adel | À faire |
| 4–5 | Auto | Build iOS (GitHub Actions) | CI | À faire |
| 5–7 | Auto | App Store review | Apple | À faire |
| 7–8 | 1min | Release on App Store | Adel | À faire |

**Total pour Adel** : ~6 heures (étalées sur 5 jours).

---

## 🆘 EN CAS DE BLOCAGE

- **GitHub Secrets manquants** → Secrets non chiffrés correctement. Vérifier noms exacts (case-sensitive).
- **Build EAS échoue** → Vérifier logs GitHub Actions. Souvent : EXPO_TOKEN invalide OU secrets manquants.
- **TestFlight submission automatique échoue** → Vérifier ASC credentials. Peut nécessaire créer un profil EAS submit custom.
- **Apple rejette la soumission** → Lire messages Apple dans App Store Connect. Répondre ou corriger et re-submit.

**Contact support** :
- EAS Help: https://docs.expo.dev/eas/
- Apple Developer: https://developer.apple.com/contact/
- Loki Music Dev: adel.khatra@live.fr

---

## 📋 FINALE CHECKLIST PRÉ-SUBMISSION

Avant cliquer « Submit for Review » sur day 5 soir :

```
✅ All GitHub Secrets configured (5/5)
✅ 3 IAP products created in App Store Connect
✅ Apple IAP secrets in Supabase (3/3)
✅ Stripe keys corrected (sk_... + pk_...)
✅ 6 screenshots uploaded
✅ Métadonnées remplies FR + EN
✅ Compte test créé + confirmé
✅ Device test : 5 recognitions OK, 0 crash
✅ App Review Notes remplies dans App Store Connect
✅ Build iOS 1.0.0 (312) in TestFlight, ready to submit
✅ node scripts/verify-app-store-readiness.cjs → 75/75 ✅

→ READY TO CLICK « SUBMIT FOR REVIEW »
```

---

**Audit généré par Claude Haiku 4.5 — 28 septembre 2026**

Fichier source : `docs/APP_STORE_READINESS_AUDIT_20260928.md`
