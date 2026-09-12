# PHASE 3: PLAYLISTS PAYANTES — Plan d'Implémentation Complet

**Date:** 12 septembre 2026  
**Statut:** À LANCER  
**Audience:** Adel

---

## 🎯 Objectif

Permettre aux créateurs KEEP de **vendre leur sélection musicale** (playlist) à prix fixe, avec:
- ✅ Accès après paiement Stripe illimité
- ✅ Téléchargement MP3 direct
- ✅ 100% pour le créateur (KEEP prend 0% pour l'instant)
- ✅ Visibilité Super Admin complète

---

## 📊 État Actuel

### ✅ Déjà Prêt (95%)
**Base de données (Supabase)**
- `playlist_sale_offers` table ✓
- `playlist_sale_payments` table ✓
- `keep_playlist_sale_access()` function ✓
- `keep_playlist_sale_set_price()` function ✓
- `keep_playlist_sale_my_offers()` function ✓
- `keep_playlist_sale_offers_for_profile()` function ✓
- `keep_playlist_sale_masked_track_ids()` function ✓

**Services (TypeScript)**
- `playlistSaleService.ts` complet ✓
- Tous les RPC appelables ✓

**Règles d'accès**
- Seuil: 100 followers (configurable Super Admin) ✓
- Masquage des morceaux en vente ✓
- Lecture publique des offres ✓

### ⏳ À Faire (5%)
1. **UI créateur** — Fixer/modifier prix d'une playlist
2. **Paiement** — Intégration Stripe Connect backend
3. **Achat client** — Écran achat sur profil public
4. **Téléchargement** — Livraison des fichiers MP3
5. **Admin** — Dashboard Super Admin

---

## 🏗️ Architecture: Flux Complet

```
CRÉATEUR                          KEEP BACKEND                    CLIENT/ACHETEUR
  │                                    │                                │
  ├─ Profil → Creator Panel            │                                │
  │   "Vendre ma playlist"              │                                │
  │       ↓                             │                                │
  ├─ Selecteur de playlist             │                                │
  │   (seulement si ≥100 followers)     │                                │
  │       ↓                             │                                │
  ├─ Fixer prix: 15€                   │                                │
  │   (POST setPlaylistSalePrice)       │                                │
  │       ↓                             │                                │
  ├─ keep_playlist_sale_set_price() ···> [INSERT playlist_sale_offers]  │
  │       ↓                             │                                │
  ├─ ✅ "Playlist en vente"             │                                │
  │                                     │                                │
  │                                     │                          Profil du créateur
  │                                     │                               │
  │                                     │                          ├─ Playlists normales
  │                                     │                          ├─ Playlists EN VENTE
  │                                     │                          │   "Playlist X - 15€"
  │                                     │                          │       ↓
  │                                     │                          ├─ Clic "ACHETER"
  │                                     │                          │       ↓
  │                                     │                          ├─ Panier / Checkout
  │                                     │                          │   (Stripe)
  │                                     │                          │       ↓
  │                                     │ [Webhook Stripe] <········  Paiement réussi
  │                                     │       ↓                      │
  │                                     │ [keep-stripe-webhook]        │
  │                                     │       ↓                      │
  │                                     │ INSERT playlist_sale_payments│
  │                                     │       ↓                      │
  │                                     │ SEND download_link + MP3s    ┼────→ Email + Download
  │                                     │                              │
  │
  SUPER ADMIN                          │
     │                                 │
     ├─ Dashboard Playlist Sales       │
     │   "Toutes les offres"           │
     │   "Tous les paiements"          │
     │   "Revenus par créateur"        │
     │       ↓                         │
     ├─ keep_admin_playlist_sale_offers() ···
     ├─ keep_admin_playlist_sale_payments() ···
```

---

## 📋 Tâches Détaillées

### PHASE 3A: UI Créateur (Frontend Mobile)

**Fichier:** `packages/mobile/src/components/PlaylistSalePanel.tsx` (NOUVEAU)

```typescript
Features:
- Lister mes playlists (KEEP smart albums + connectées)
- Afficher accès (followers / threshold)
- Fixer prix pour chaque playlist
- Afficher la liste des offres actives
- Editer / désactiver une offre
- Icone 💰 pour les playlists en vente

État:
- playlistId: string
- playlistName: string
- priceCents: number | null
- pricing: boolean (en cours)
- error: string
- myOffers: PlaylistSaleOffer[]
```

**Intégration CreatorToolsPanel:**
- Bouton "💰 Vendre mes playlists" si saleAccess.unlocked
- Navigation vers PlaylistSalePanel

### PHASE 3B: Paiement Backend (Stripe Connect)

**Fichier:** `supabase/functions/keep-stripe-connect-webhook/index.ts` (NOUVEAU)

```typescript
Responsabilités:
1. Recevoir POST de Stripe (événement charge.succeeded)
2. Vérifier la signature webhook
3. Chercher l'offer_id dans metadata
4. Insérer dans playlist_sale_payments (status: COMPLETED)
5. Envoyer email "Merci pour votre achat"
6. Générer lien de téléchargement temporaire

Input: Stripe Event (charge.succeeded)
Output: playlist_sale_payments row créée + email

Coûts:
- Stripe: 2.9% + 0.30€ par transaction
- Email (Brevo): gratuit
```

**Fichier:** `supabase/functions/keep-playlist-purchase-init/index.ts` (NOUVEAU)

```typescript
Responsabilités:
1. Utilisateur clique "ACHETER" sur profil public
2. Valider: offre existe, utilisateur authentifié, pas auto-achat
3. Créer Stripe Checkout Session
4. Retourner checkout_url

Input: { offerId: UUID, buyerId: UUID }
Output: { checkoutUrl: string, sessionId: string }
```

### PHASE 3C: Achat Client (Frontend Mobile)

**Fichier:** `packages/mobile/src/components/PlaylistSaleCard.tsx` (NOUVEAU)

```typescript
Props:
- offer: PublicPlaylistSaleOffer
- sellerId: UUID
- onPurchaseComplete: () => void

Features:
- Afficher nom + prix
- Bouton "ACHETER"
- Ouvrir Stripe Checkout (web ou app)
- Attendre confirmation paiement
- Afficher "Téléchargement commencé"
```

**Intégration ProfilePublicScreen:**
```typescript
// Dans le profil public d'un créateur:
if (offers.length > 0) {
  <View style={s.playlistSalesSection}>
    {offers.map((offer) => <PlaylistSaleCard ... />)}
  </View>
}
```

### PHASE 3D: Téléchargement (Backend + Frontend)

**Fichier:** `supabase/functions/keep-playlist-download/index.ts` (NOUVEAU)

```typescript
Responsabilités:
1. Vérifier: utilisateur acheté cette playlist
2. Lister tous les track_id de la playlist
3. Récupérer les URIs Spotify / Apple Music
4. Générer ZIP contenant:
   - playlist.m3u (liste pistes)
   - metadata.json (infos vendeur)
   - artwork.jpg
5. Signer URL Supabase Storage
6. Retourner download_url

Sécurité:
- Token dans URL valide 1h seulement
- Vérifier ownership à chaque download
- Logger les téléchargements

Output:
{
  downloadUrl: "https://...",
  playlistName: "...",
  trackCount: 42,
  expiresAt: "2026-09-12T16:00:00Z"
}
```

### PHASE 3E: Super Admin Dashboard

**Fichier:** `packages/admin/src/screens/PlaylistSalesAdminScreen.tsx` (NOUVEAU)

```typescript
Tabs:
1. "Offres" — keep_admin_playlist_sale_offers()
   - Colonne: Créateur, Playlist, Prix, Actif, Date
   - Pagination
   - Filtre par statut

2. "Paiements" — keep_admin_playlist_sale_payments()
   - Colonne: Créateur → Acheteur, Playlist, Montant, Statut, Date
   - Pagination
   - Export CSV

3. "Revenus" — Requête custom
   - Revenu total KEEP: 0€ (pour l'instant)
   - Revenus par créateur
   - Top 10 playlists
   - Graphique mensuel

Permissions: SUPER_ADMIN / ADMIN / FINANCE (existant)
```

---

## 🔐 Sécurité Requise

### Validation Paiement
```sql
-- Avant d'autoriser téléchargement:
SELECT 1 FROM playlist_sale_payments
WHERE buyer_id = auth.uid()
  AND status = 'COMPLETED'
  AND seller_id = <seller_id>
  AND offer_id = <offer_id>
```

### Masquage des Morceaux
```typescript
// Dans PublicProfileScreen:
const maskedIds = await loadMaskedPlaylistSaleTrackIds(profileId);
const visibleTracks = allTracks.filter(t => !maskedIds.includes(t.id));
```

### Webhook Stripe
```typescript
// Signer TOUS les payloads Stripe:
const signature = req.headers['stripe-signature'];
const event = stripe.webhooks.constructEvent(body, signature, WEBHOOK_SECRET);
```

---

## 📅 Timeline

### Sprint 1 (Jour 1-2)
- [ ] PlaylistSalePanel UI (créateur fixe prix)
- [ ] Integration CreatorToolsPanel
- [ ] Test: fixer prix & masquage morceaux

### Sprint 2 (Jour 3-4)
- [ ] Stripe Connect config (Adel via Dashboard Stripe)
- [ ] keep-stripe-connect-webhook création
- [ ] keep-playlist-purchase-init création

### Sprint 3 (Jour 5-6)
- [ ] PlaylistSaleCard UI (afficher offres publiques)
- [ ] ProfilePublicScreen intégration
- [ ] Test: clic achat → Stripe Checkout

### Sprint 4 (Jour 7-8)
- [ ] keep-playlist-download création
- [ ] Fichier ZIP + M3U generation
- [ ] Email de téléchargement

### Sprint 5 (Jour 9-10)
- [ ] PlaylistSalesAdminScreen création
- [ ] Dashboard Super Admin
- [ ] Tests E2E complets

---

## 💰 Coûts Finaux

| Ressource | Coût/Mois | Notes |
|-----------|-----------|-------|
| Supabase | ~30€ | +emails, +storage |
| Stripe Connect | 2.9% + 0.30€ | Uniquement si vente |
| Brevo | 0€ | Emails gratuits |
| GitHub Actions | 0€ | Inclus |
| **TOTAL** | **~30€ + 2.9%** | Transparent |

---

## ✅ Checklist Final

- [ ] Phase 3A: PlaylistSalePanel UI FAIT & TESTÉ
- [ ] Phase 3B: Stripe Connect FAIT & SIGNÉ
- [ ] Phase 3C: PlaylistSaleCard UI FAIT & TESTÉ
- [ ] Phase 3D: Download backend FAIT & TESTÉ
- [ ] Phase 3E: Super Admin dashboard FAIT & TESTÉ
- [ ] Test E2E: Créateur → Achat → Téléchargement
- [ ] Documentation utilisateur
- [ ] Prêt PRODUCTION

---

**Commençons? 🚀**
