# Loki Music — Notes pour le reviewer App Store

Ce document est destiné à être copié dans App Store Connect (App Review Information → Notes) au moment de la soumission. Il n'est pas affiché aux utilisateurs.

## Résumé de l'application (5 lignes)

Loki Music identifie les morceaux joués autour de l'utilisateur (micro) ou partagés depuis d'autres apps, et les garde dans une bibliothèque personnelle organisée automatiquement par style musical. Chaque utilisateur a un profil public consultable par les autres, avec ses morceaux gardés, ses abonnés et un système attribuant à chaque morceau son "premier découvreur" dans le réseau social. L'app propose un essai gratuit immédiat sans création de compte, avec conversion vers un compte réel (pseudo + e-mail + mot de passe) au moment choisi par l'utilisateur, jamais imposée au lancement. Un mode "Soirées" (Battle) permet des défis musicaux entre utilisateurs en direct. Aucune publicité, aucun SDK de tracking publicitaire ou d'analytics cross-app.

## Fonctions sensibles à expliquer au reviewer

- **Reconnaissance musicale par microphone** — Le micro n'est utilisé que pendant une session d'écoute démarrée explicitement par l'utilisateur (bouton "Écouter"), jamais en arrière-plan sans action explicite. L'audio capté sert uniquement à générer une empreinte pour identifier le morceau (via un moteur serveur) — aucun enregistrement audio n'est conservé après identification. Permission demandée avec texte explicatif clair (`NSMicrophoneUsageDescription`).
- **Marketplace de "découvertes musicales" — DÉSACTIVÉ sur cette build iOS.** Le code existe (flag `playlist_marketplace`) mais reste éteint côté serveur pour cette soumission : aucun écran de vente/achat n'est accessible depuis l'app iOS. Ce point est décidé volontairement pour rester hors du périmètre Apple In-App Purchase (règle 3.1.1) tant que ce flux n'est pas branché sur un vrai moyen de paiement conforme. Si le reviewer cherche une fonction d'achat de playlists : elle est intentionnellement invisible sur cette build, ce n'est pas un oubli.
- **Mode démo** — Un mode de démonstration interne existe dans le code mais n'est jamais accessible en production (`__DEV__` + variable d'environnement dev-only). Il n'apparaît sous aucune forme dans le build soumis à Apple.
- **Localisation** — Utilisée uniquement, avec consentement, pour préremplir ville/pays sur le profil et proposer des profils/événements à proximité. Jamais de tracking de déplacement en arrière-plan.

## Comment tester l'application

1. **Ouvrir l'app** : elle démarre directement en mode essai gratuit (aucun écran de connexion imposé), avec 3 morceaux identifiables sans inscription.
2. **Créer un compte** : appuyer sur le lien discret "Se connecter / Créer mon compte" en bas de l'écran d'accueil (ou il apparaît automatiquement dès qu'une action nécessitant un compte est tentée, ex. suivre un profil). Remplir pseudo + e-mail + mot de passe, puis confirmer via le lien reçu par e-mail.
3. **Tester l'écoute** : onglet "Écouter" → autoriser le microphone → jouer un morceau audible près de l'appareil (ou utiliser le partage depuis une autre app musicale vers Loki Music). Le morceau détecté propose GARDER / PASSER.
4. **Bibliothèque et profil** : les morceaux gardés apparaissent dans "Ma Musique", organisés automatiquement ; le profil public liste les morceaux gardés publics et les abonnés.
5. **Marketplace** : ne pas chercher d'écran d'achat de playlists — intentionnellement désactivé sur cette build (voir ci-dessus).

## Compte de test reviewer

À compléter par Adel au moment de la soumission (identifiant + mot de passe d'un compte de démonstration réel, créé pour l'occasion) — ce document ne doit jamais contenir d'identifiants réels tant qu'il n'est pas transmis directement à Apple via App Store Connect.
