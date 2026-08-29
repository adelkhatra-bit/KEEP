# KEEP — Dossier de préparation App Store

Dernière mise à jour : 29 août 2026
Branche de référence : `reconcile/claude-main-20260825`

## Objectif

Ce document sépare ce qui est réellement validé dans KEEP de ce qui nécessite encore une configuration fournisseur, un compte Apple ou un test sur appareil physique. Aucun élément externe non testé n'est considéré comme terminé.

## État de sortie

### Validé dans le projet

- Build web et mobile TypeScript/CI.
- Guardian mobile 390×844 et desktop.
- Parcours Human Guardian automatisé.
- Génération du projet iOS par Expo prebuild.
- Préflight natif App Store principal.
- Module iOS ShazamKit présent dans le projet natif.
- Suppression de compte depuis l'application et fonction serveur JWT.
- Liens Confidentialité / Conditions dans les réglages avancés.
- Persistance profil Supabase : pseudo, bio, avatar, ville, pays, date de naissance, genre, réseaux, site web.
- Avatar dans Supabase Storage.
- Localisation GPS + modification manuelle.
- Arrêt explicite du micro et libération de la capture.
- Extraits de profils : renouvellement automatique d'une URL Apple périmée, recherche multi-storefront FR/US/GB/CA, deuxième tentative silencieuse avant erreur.

### En cours de validation

- Compilation iOS Simulator incluant ShazamKit, StoreKit et extension de partage.
- Nouveau contrat navigateur Profil : Vibes → Albums → KEEP avec état d'onglet réellement vérifié, y compris profil KEEP vide.

## Blocages production réels

### 1. Reconnaissance microphone hors ShazamKit iOS

État Supabase actuel :

- AudD : non configuré.
- ACRCloud : non configuré.
- `AUDD_API_TOKEN` / `AUDD_API_KEY` : absent.
- `ACRCLOUD_HOST` : absent.
- `ACRCLOUD_ACCESS_KEY` : absent.
- `ACRCLOUD_ACCESS_SECRET` : absent.

Conséquence : le web et Android ne disposent pas actuellement d'un moteur serveur d'empreinte audio capable d'identifier de façon fiable un morceau arbitraire capté par le microphone. Le resolver public Apple/Deezer peut résoudre des métadonnées ou liens, mais ne remplace pas une reconnaissance d'empreinte audio.

Action avant production : configurer au minimum un moteur de reconnaissance serveur, idéalement deux en cascade, puis exécuter un test physique téléphone ← musique jouée par un autre appareil.

### 2. Brevo / e-mails KEEP

La logique existe : vérification e-mail par code, fonction admin de diagnostic, webhook Brevo avec token personnalisé et journal `email_delivery_events`.

État secrets actuel :

- `BREVO_API_KEY` : absent.
- `BREVO_SENDER_EMAIL` : absent.
- `BREVO_SENDER_NAME` : absent.
- `BREVO_WEBHOOK_TOKEN` : absent.
- Événements de délivrabilité enregistrés : 0.

Conséquence : aucun envoi ou test de délivrabilité Brevo réel ne peut être déclaré validé.

Action avant production : créer/valider l'identité expéditeur dans Brevo, renseigner les quatre valeurs, enregistrer le webhook, envoyer un e-mail de test réel, puis vérifier SENT/DELIVERED dans Supabase.

La création d'une nouvelle boîte e-mail ou d'un domaine de messagerie n'est pas une opération réalisable depuis le dépôt GitHub ou Supabase ; elle doit être provisionnée chez le fournisseur de domaine/messagerie, puis l'adresse doit être validée chez Brevo.

### 3. Abonnements / achats intégrés Apple

L'écran des offres existe, mais les boutons d'abonnement ne constituent pas encore une transaction App Store complète. Une sortie payante nécessite :

- produits créés dans App Store Connect ;
- identifiants produits définitifs ;
- transaction StoreKit reliée aux offres ;
- restauration des achats ;
- validation serveur / synchronisation du droit premium ;
- tests StoreKit sandbox / TestFlight ;
- textes prix/renouvellement conformes à la fiche App Store.

Ne pas soumettre les abonnements comme fonctionnels tant que cette boucle n'est pas validée de bout en bout.

### 4. Validation physique iPhone obligatoire

Les CI web/simulateur ne prouvent pas :

- reconnaissance réelle ShazamKit avec musique jouée par un autre appareil ;
- autorisation et libération réelle du microphone sur iPhone ;
- comportement audio avec écran verrouillé / changement d'application ;
- notifications APNs sur appareil réel ;
- achat StoreKit sandbox ;
- caméra/GPS/partage natif selon permissions.

Ces tests doivent être exécutés sur une build TestFlight signée.

## Matrice QA utilisateur avant soumission

Viewport navigateur obligatoire : 390×844.

Parcours connecté :

1. Connexion / récupération de compte.
2. Écouter → démarrer micro → animation active → arrêter → état inactif.
3. Jouer un morceau depuis un autre appareil → reconnaissance → GARDER/PASSER → persistance.
4. Découvertes.
5. Playlists → ouvrir morceau → pré-écoute → suppression → confirmation → disparition après reload.
6. Soirées → KEEP Battle solo → invitation → accepter/refuser → Battle 1v1 → jauge → fin → revanche.
7. Profil → KEEP → Vibes → Albums → KEEP sans refresh.
8. Profil public d'un autre utilisateur → réseaux sociaux → pré-écoute de plusieurs morceaux.
9. Modifier profil → avatar → GPS → ville/pays → naissance → réseaux → enregistrer.
10. Reload complet → vérifier toutes les données persistantes.
11. Réglages avancés → Confidentialité / Conditions → retour → Playlists.
12. Ajouter/vérifier e-mail → réception réelle → code → statut vérifié.
13. Supprimer compte sur compte QA dédié → vérifier suppression et session fermée.
14. Achat sandbox + restauration sur un second appareil avant activation des offres payantes.

## App Store Connect — éléments externes à finaliser

- Adhésion Apple Developer active et payée.
- App créée dans App Store Connect pour `com.adelkhatra.keep`.
- Contrats, banque et fiscalité validés si IAP.
- Capability ShazamKit autorisée dans la signature de distribution si requise par le profil Apple utilisé.
- Produits IAP et identifiants définitifs.
- Privacy Nutrition Labels correspondant exactement aux données réellement collectées.
- URL politique de confidentialité publique et fonctionnelle.
- URL support publique.
- Catégorie, âge, copyright, description, mots-clés.
- Captures App Store aux tailles exigées pour les appareils ciblés.
- Compte de démonstration pour App Review si une connexion est nécessaire.
- Notes de review expliquant microphone, reconnaissance musicale, localisation et partage social.

## Critère GO / NO-GO

GO uniquement si :

1. CI principale verte ;
2. audit navigateur 390×844 vert ;
3. compilation iOS native verte ;
4. TestFlight physique complet vert ;
5. reconnaissance musicale réelle réussie de manière répétable ;
6. Brevo envoie et reçoit un événement `delivered` ;
7. achats/restauration validés si les offres payantes sont présentes dans la version soumise ;
8. suppression de compte validée sur environnement de production ;
9. aucun écran blanc, bouton mort ou donnée profil perdue après reload.

Tant qu'un des points 4 à 7 manque, KEEP peut être très proche de la soumission, mais ne doit pas être présenté comme prêt à 100 % pour une release payante App Store.
