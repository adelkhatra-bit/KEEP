# Loki Music — Checklist avant "Submit for Review"

Basée sur l'audit Bloc 1 du 22/09/2026. Ne pas soumettre tant qu'une case 🔴 n'est pas cochée.

## 🔴 Bloquant

- [ ] Adhésion Apple Developer active (payée, identité validée) — https://developer.apple.com/account/
- [ ] `APPLE_IAP_ISSUER_ID` / `APPLE_IAP_KEY_ID` / `APPLE_IAP_PRIVATE_KEY` configurés dans Super Admin → Intégrations (nécessaires pour que `keep-iap-verify` valide les reçus Apple réels)
- [ ] `STRIPE_SECRET_KEY` corrigé — contenait une clé publique `pk_...` au lieu d'une clé secrète `sk_...` (vérifié le 22/09) ; `STRIPE_PUBLISHABLE_KEY` renseigné séparément
- [ ] 3 produits IAP créés dans App Store Connect : `com.adelkhatra.keep.premium.monthly`, `com.adelkhatra.keep.creatorpro.monthly`, `com.adelkhatra.keep.venuepro.monthly`
- [ ] Flag `playlist_marketplace` confirmé **désactivé** en production avant soumission (décision Adel 22/09 : marketplace reste web-only, pas d'IAP pour l'instant)
- [ ] Build de production **vert** sur EAS (dernier succès connu : #62, 16/09 ; échecs #65-75 root-causés et corrigés le 22/09 — un nouveau build n'a pas encore été relancé pour confirmer)
- [ ] Screenshots App Store (6.7", 6.5", 5.5", iPad si `supportsTablet` activé)
- [ ] Vidéo preview 30s (optionnel selon Apple, mais demandé dans la mission)
- [ ] Description FR + EN, mots-clés
- [ ] Reviewer login (compte de test réel créé pour Apple) + `APP_STORE_REVIEW_NOTES.md` collé dans App Store Connect → App Review Information

## 🟠 Important (à faire rapidement après, pas bloquant pour soumettre)

- [ ] Compte Google Play Developer + `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (aucun des deux configuré à ce jour — audit iOS uniquement pour cette soumission)
- [ ] Paddle configuré si le rail d'abonnement web doit être actif au lancement (`PADDLE_SELLER_ID/CLIENT_TOKEN/API_KEY/WEBHOOK_SECRET` tous absents actuellement)
- [ ] Vérifier que le lien "Restaurer mes achats" est visible et fonctionnel dans l'app
- [ ] Politique de confidentialité / CGU : déjà publiques et à jour (`https://adelkhatra-bit.github.io/KEEP/privacy/`, `.../terms/`) — vérifier une dernière fois qu'elles reflètent bien l'état réel des fonctions avant soumission

## 🟢 Déjà vérifié / rien à faire

- [x] Aucun SDK de tracking publicitaire ou analytics cross-app dans le code mobile (audit du 22/09 — dépendances passées en revue une à une)
- [x] Permissions déclarées avec textes clairs en français (micro, localisation, photos) dans `app.json`
- [x] Bundle ID cohérent iOS/Android : `com.adelkhatra.keep`
- [x] Nom affiché "Loki Music" partout (app, e-mails)
- [x] `verify-app-store-readiness.cjs` : dernier contrôle connu 62/62 (à relancer avant soumission finale)

## Dernière étape

- [ ] Une fois toutes les cases 🔴 cochées : relancer `node scripts/verify-app-store-readiness.cjs` et `npx expo-doctor` une dernière fois, puis cliquer "Submit for Review".
