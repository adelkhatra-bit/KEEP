# Phase 3B – Configuration Stripe et Email

## Objectif
Intégrer complètement Stripe Connect avec:
- Webhook pour traiter les paiements réussis
- Notifications email aux buyers et sellers via Brevo
- Logging robuste pour le debugging en production

## 1. Configuration Stripe Dashboard

### 1.1 Webhook Endpoint
**Stripe Dashboard → Developers → Webhooks**

Créer un nouveau endpoint:
- URL: `https://rrhqsqzcplvmwxizqnla.supabase.co/functions/v1/keep-stripe-playlist-webhook`
- Événements sélectionnés:
  - `charge.succeeded` (paiement réussi)
  - `charge.failed` (optionnel, pour logging)

Copier le **Signing Secret** → `STRIPE_WEBHOOK_SECRET` dans Supabase secrets

### 1.2 Clés API
- **Secret Key**: `STRIPE_SECRET_KEY` (déjà configurée)
- **Publishable Key**: Pour le client (déjà dans le code)

## 2. Configuration Supabase Secrets

**Supabase Dashboard → Settings → Secrets**

```
STRIPE_SECRET_KEY = sk_live_...
STRIPE_WEBHOOK_SECRET = whsec_...
BREVO_API_KEY = xkeysib_...
SUPABASE_URL = https://rrhqsqzcplvmwxizqnla.supabase.co
SUPABASE_SERVICE_ROLE_KEY = eyJhbG...
```

## 3. Configuration Brevo (Transactionnel)

### 3.1 Connexion API
- Récupérer la clé API depuis Brevo Dashboard → Settings → SMTP & API

### 3.2 Email Expediteur
L'email utilisé dans les fonctions:
```
sender: { name: 'KEEP', email: 'noreply@keep-music.com' }
```

Vérifier que ce domaine/email est configuré comme sender autorisé dans Brevo.

### 3.3 Templates (Optionnel à l'avenir)
Pour passer à des templates au lieu de HTML inline:
1. Créer templates dans Brevo
2. Remplacer les `htmlContent` par `templateId` et `params`
3. Avantage: personnaalisation centralisée, branding facile

## 4. Flux de Paiement (Phase 3B)

```
Client clique "ACHETER"
  ↓
[POST] keep-stripe-playlist-checkout
  - Vérifie l'auth et les conditions (pas auto-achat, pas doublon)
  - Crée session Stripe.checkout.sessions
  - Retourne checkoutUrl + sessionId
  ↓
Client redirigé vers Stripe Checkout
  - Remplit infos carte
  - Clique "Payer"
  ↓
Stripe traite le paiement
  ↓
[WEBHOOK] Stripe → keep-stripe-playlist-webhook (charge.succeeded)
  - Vérifie signature (webhookSecret)
  - Insère paiement dans DB (status='COMPLETED')
  - Charge les profiles du buyer et seller
  - Envoie email buyer → "Voici ton lien de téléchargement"
  - Envoie email seller → "Tu as vendu une playlist"
  ↓
Client reçoit email avec lien download
  - Clique lien
  - [GET] keep-playlist-download
    * Vérifie achat dans playlist_sale_payments
    * Retourne manifest JSON avec les tracks
  ↓
Client télécharge (Phase 3D: ZIP ou M3U)
```

## 5. Logging et Debugging

### Logs Supabase
**Supabase Dashboard → Functions → Logs**

Chercher:
- `[stripe-webhook]` - événements webhook
- `[stripe-checkout]` - tentatives de checkout
- `[playlist-download]` - accès aux téléchargements

Erreurs possibles:
- `Missing signature` → webhookSecret mal configurée
- `Invalid signature` → clé secrets ne correspond pas
- `Failed to insert payment` → schema DB incorrect ou contrainte violée
- `Failed to send [buyer/seller] email` → BREVO_API_KEY mal configurée

### Logs Stripe
**Stripe Dashboard → Developers → Logs**
- Vérifie chaque appel API
- Webhook delivery status (succès/retry)
- Erreurs d'authentification ou rate limits

## 6. Tests Phase 3B

### 6.1 Test Webhook Manuellement
```bash
curl -X POST https://rrhqsqzcplvmwxizqnla.supabase.co/functions/v1/keep-stripe-playlist-webhook \
  -H "Content-Type: application/json" \
  -H "stripe-signature: t=1234567890,v1=invalid" \
  -d '{"type":"charge.succeeded"}'
# → Doit retourner 400 "Invalid signature"
```

### 6.2 Test Checkout
1. Login créateur avec 100+ followers
2. Créer une playlist et fixer un prix (10€)
3. Logout, login comme autre utilisateur
4. Aller sur profil du créateur
5. Voir la carte playlist vendable
6. Cliquer "ACHETER" → Redirection Stripe

### 6.3 Test Email
- Utiliser email de test Brevo ou vrai email
- Vérifier livraison spam (KEEP n'est pas authentifié SPF/DKIM → À faire)
- Vérifier lien download dans email

## 7. Checklist Phase 3B

- [ ] Secrets Stripe configurées (SECRET_KEY + WEBHOOK_SECRET)
- [ ] Secret Brevo configurée (BREVO_API_KEY)
- [ ] Webhook endpoint créé dans Stripe Dashboard
- [ ] Email sender (noreply@keep-music.com) autorisé dans Brevo
- [ ] Test webhook signature (curl manual)
- [ ] Test checkout (créateur → client → paiement)
- [ ] Test email (buyer + seller)
- [ ] Logs générés et consultables
- [ ] Pas d'erreur console en production
- [ ] Paiement enregistré en DB après webhook

## 8. Phase 3C Prochaines: PlaylistSaleCard

Une fois 3B testé:
1. Créer composant PlaylistSaleCard (affiche offre sur profil public)
2. Intégrer dans ProfilePublicScreen
3. Bouton "ACHETER" → route vers PlaylistSale checkout
