# Audit — Profil de vente vu par un visiteur (Loki Music)
_23/09/2026 — chef de projet : agent Loki Music. Règle absolue respectée : rien supprimé, restyling + mise en valeur uniquement._

## Réponses directes à tes questions

| Ta question | Réponse | Preuve dans le code |
|---|---|---|
| Quand un user vend, est-ce **clair** sur son profil pour un visiteur ? | **Oui maintenant** — la vitrine « En vente » est **remontée tout en haut** du profil (juste après l'identité), badge « ★ EN VENTE », bordure violette. | `PublicUserProfileScreen.tsx` § `saleShowcase` (haut de page) |
| Est-ce que ça **donne envie d'acheter** ? | **Oui** — bouton menthe « ▶ Écouter gratuitement », prix visible, phrases marketing rotatives + rareté dans l'aperçu, prix total en pastille. | `PlaylistSaleImmersivePreview.tsx` (`MARKETING_LINES`, `totalPricePill`) |
| Peut-on **écouter un morceau** ? | **Oui** — aperçu immersif : swipe entre extraits, play/pause, compte à rebours. | `PlaylistSaleImmersivePreview.tsx` (`playTrackAt`, `SwipeDeck`) |
| Le **titre / texte est-il caché** ? | **Oui** — aucun titre, artiste ni pochette avant l'achat. La RPC des extraits ne renvoie jamais ces champs. | `loadPlaylistSaleOfferPreviewTracks` + libellé « 🔒 Titres et pochettes cachés » |
| **Shazam est-il filtré** (pas d'écoute exploitable) ? | **Oui** — anti-Shazam : extrait court 5–8 s, **point de départ aléatoire**, **pitch-shift**, **voix off Loki Music** par-dessus. | `audioPreviewService.ts` → `playAntiShazamPreviewSegment`, `speakAntiShazamLine` |
| Pas de possibilité d'écoute « propre » ? | **Correct** — l'extrait est volontairement dégradé (badge « 🛡️ Extrait protégé »), impossible à identifier automatiquement. | `PlaylistSaleImmersivePreview.tsx` § `protectionBadge` |

## Mécanique de protection anti-Shazam (détail vérifié)
`packages/mobile/src/services/audioPreviewService.ts` — fonction **isolée** de la lecture normale (Battle/Swipe) pour ne rien casser :
- Durée d'extrait aléatoire **5 000–8 000 ms**.
- Offset de départ aléatoire (natif : 15 %–70 % du morceau ; web : 20–50 s).
- **Pitch-shift** léger (`setRateAsync(rate, false)` natif ; `playbackRate` + `preservesPitch=false` web).
- **Voix off** française tirée au hasard, jamais mise en cache (`expo-speech`).
→ Ces 4 couches empêchent une reconnaissance Shazam/ACRCloud fiable tout en laissant « goûter » la vibe.

## ⚠️ LA vraie incohérence restante (décision requise de ta part)
La vitrine est **masquée en production** par le flag Super Admin `playlist_marketplace` (OFF).
Raison : l'achat ouvre un **lien PayPal externe** (`Linking.openURL`) → **rejet Apple garanti** (règle 3.1.1 : contenu déverrouillé dans l'app doit passer par l'In-App Purchase Apple).

**Conséquence concrète :** aujourd'hui, un visiteur sur le profil d'un vendeur **ne voit rien** — d'où ta perception « les produits en vente ne sont pas mis en valeur ».

### 3 options (une seule décision : « A », « B » ou « C »)
- **A — Livrer v1 sans marketplace** (flag OFF). Soumission Apple propre et rapide. La vitrine reste prête, activable plus tard. _Recommandé pour entrer chez Apple maintenant._
- **B — Activer le flag tout de suite.** Vitrine visible immédiatement, mais **risque de rejet** à la soumission.
- **C — Brancher Apple In-App Purchase (StoreKit)** puis activer. Conforme **et** valorisé (objectif final). Chantier supplémentaire.

## Inspirations plateformes virales (appliquées / à faire)
- **Bandcamp / SoundCloud** : écoute avant achat, prix clair → ✅ fait.
- **App Store / Gumroad** : produit vendeur mis en avant en haut de page → ✅ fait (vitrine remontée).
- **TikTok/Instagram** : compréhension immédiate, gros boutons → ✅ coach-marks (P2) + bouton « ▶ Écouter gratuitement » menthe.
- **À faire (selon décision A/B/C)** : compteur social « X personnes ont débloqué », mini-jaquette floutée animée, notification push « nouveau pack en vente » (le « spot de pub » que tu évoques).

## Tâches (réunion agents — feuille de route)
1. ✅ Remonter + accentuer la vitrine (fait, commit `bb89c56f`).
2. ✅ Rendre l'achat désirable + clair enfant (bouton menthe « Écouter gratuitement », « 🔒 Titres et pochettes cachés »).
3. ⏳ **Décision A/B/C** (bloquant App Store) — en attente de toi.
4. ⏳ Si B ou C : compteur social + push « nouveau pack » + StoreKit (si C).
5. ✅ Vérifs : `tsc`, `jest` (284+18), `verify-source-of-truth`.
