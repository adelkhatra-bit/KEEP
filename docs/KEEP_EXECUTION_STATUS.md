# KEEP — EXECUTION STATUS

Source unique: `reconcile/claude-main-20260825`
Dernière mise à jour: 2026-09-28

Ce fichier est le registre permanent des tâches. Une demande utilisateur n'est considérée terminée qu'après code poussé + preuve CI/test.

## RÉFÉRENCE VISUELLE VALIDÉE — 2026-09-28
- Maquette interactive/visuelle validée par l'utilisateur: 10 écrans LOKI violet/noir (Écouter, Découvertes, Playlists, Gérer un album, Prix et paiement, Profil, FREE/Offres, Hamburger, Réglages, Connexion paiement).
- Reproduire cette hiérarchie à l'identique fonctionnellement sans supprimer les modules existants; réorganiser les fonctions existantes derrière cette surface simple.
- Source conversation image générée: gen_id 97017001-f499-4c0d-ae32-eddc25616949.
- Avant chaque remplacement d'écran: inventorier les fonctions existantes, conserver celles qui restent nécessaires, puis brancher et tester la chaîne complète.

## ATTRIBUTION PREMIER DÉCOUVREUR — INVARIANT
- Le premier KEEP issu d'une écoute directe est enregistré dans public.keep_track_first_discoveries.
- track_id est la PRIMARY KEY: une seule attribution de premier découvreur par morceau.
- L'écriture serveur utilise ON CONFLICT(track_id) DO NOTHING: les reprises ultérieures ne remplacent jamais le premier découvreur.
- profile_id a une FK ON DELETE RESTRICT: l'attribution ne peut pas disparaître par suppression normale du profil référencé.
- Objectif produit: afficher ce premier découvreur à vie sur toutes les reprises/redistributions du même track_id, même à très grande échelle.
- À sécuriser avant production: RLS de la table + tests concurrence/1M reprises simulées + vérification que tous les parcours d'écoute appellent bien la capture.

## UX CIBLE — SIMPLE, UNE SEULE ROUTE
- Écouter : écouter → PASSER / GARDER / ARRÊTER. Historique uniquement dans Mes Sessions.
- Playlists : Mes morceaux + Mes albums. Une seule fiche album pour morceaux/prix/statut.
- Vente : créer/modifier un album depuis la même fiche; aucun écran intermédiaire.
- Paiement : un seul bouton « Configurer mes paiements »; publication payante impossible tant que paiement non prêt.
- Profil : identité + KEEP DNA + réseaux + bloc commercial compact. Pas de doublon de gestion.
- Hamburger : Réglages, Compte, Aide. Les fonctions métier restent dans leurs onglets.
- Règle anti-doublon : une donnée = une source serveur; une action = une route; un album actif = une carte; aucun objet inactif affiché comme actif.
- Toute erreur serveur doit être traduite en français utilisateur; jamais de code brut comme OFFER_NOT_ACTIVE.

## EN COURS / BLOQUANT
- [ ] CI latest SHA: corriger TypeScript mobile avant tout déploiement public.
- [ ] Profil public: rendre visible la zone commerciale compacte, 3 aperçus max + VOIR LES COLLECTIONS, sans auto-navigation.
- [ ] BUG constaté adel4A: une offre active « Ma sélection · 5 titres » (5 morceaux) + une ancienne offre inactive « Sélection du 15/09 · 1 morceau ». L'UI de modification mélange l'offre inactive et affiche OFFER_NOT_ACTIVE. Filtrer les offres inactives à toutes les entrées de gestion et supprimer les routes de gestion concurrentes.
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
