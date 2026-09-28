# KEEP — EXECUTION STATUS

Source unique: `reconcile/claude-main-20260825`
Dernière mise à jour: 2026-09-28

Ce fichier est le registre permanent des tâches. Une demande utilisateur n'est considérée terminée qu'après code poussé + preuve CI/test.

## EN COURS / BLOQUANT
- [ ] CI latest SHA: corriger TypeScript mobile avant tout déploiement public.
- [ ] Profil public: rendre visible la zone commerciale compacte, 3 aperçus max + VOIR LES COLLECTIONS, sans auto-navigation.
- [ ] Refresh/rechargement profil: auditer le comportement bizarre signalé; aucune déconnexion/session perdue.
- [ ] Marketplace: calcul backend sécurisé X/Y morceaux déjà possédés; bloquer le rachat si 100% acquis.
- [ ] Marketplace: simplifier popup/texte et ajouter contour/animation cohérente.
- [ ] Paiement vendeur: interdire publication payante sans moyen de paiement/onboarding valide.
- [ ] Stripe: compte Loki livemode connecté, mais aucun PaymentIntent live observé au 2026-09-28; E2E non validé.
- [ ] iOS digital: StoreKit/IAP + vérification serveur + restauration à tester sur TestFlight réel.
- [ ] E-mails: tester réellement mot de passe oublié, livraison, lien, nouveau mot de passe et reconnexion; branding Loki.
- [ ] Notifications: vérifier son sur iPhone réel et payload APNs.
- [ ] Supabase sécurité: RLS manquant keep_track_first_discoveries; auditer/revoquer SECURITY DEFINER anon non nécessaires; corriger search_path mutable.
- [ ] Battle/Solo: sauvegarde automatique dans Mes Sessions; supprimer doublons d'accès historique.
- [ ] Images profil/jaquettes: cadrage/focal automatique sans baisse de résolution.
- [ ] Test obligatoire 390x844 complet + persistance après reload.
- [ ] Test physique iPhone/TestFlight avant App Store.

## FAIT / POUSSÉ
- [x] Catalogue vendeur compact: 3 collections visibles puis VOIR LES N COLLECTIONS — 855c091aee765ecda19a68c8f70e5fb2cdfb6719.
- [x] Correction auto-navigation vendeur sur son propre profil — 6a998d0c6fa88fccd1511ac9bbc0ab110fcd1aef.
- [x] Drawer hamburger latéral — 9aa65ab98eadf17b01aba104bc3657314ef718e5.
- [x] Nouvelle session Écouter ne recharge plus une ancienne session — 6ef83214f374621d7492867ff95903a04ffa8b76.
- [x] Statut paiement vendeur visible — c3731d1a6d8985c2162751fba55b7161db586396.
- [x] Modification d'une collection: liste de morceaux ouverte directement — e4c7a1c18043e840e551bd311a297960e1711627.
- [x] Surveillance automatique CI KEEP activée dans ChatGPT.

## GARDE-FOUS
- Ne pas modifier App.tsx pour le responsive.
- Ne pas modifier Navigation.tsx.
- Conserver la barre des 5 onglets.
- Ne pas modifier ProfileScreen.BACKUP.tsx.
- Ne jamais déclarer LIVE/PASS sans preuve.
- Ne pas déconnecter les utilisateurs lors d'un refresh ou d'une migration.
