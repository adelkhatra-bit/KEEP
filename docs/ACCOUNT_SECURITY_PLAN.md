# Sécurité du compte, accès ordinateur, Google, Authenticator — plan (Adel, 05/10/2026)

Statut : PLAN (rien de ceci n'est encore livré). Idées : IDEA-073 à IDEA-076. Règles à respecter : `config/keep-product-contract.json` > `authResilience` et `authBoundary` (aucun changement du runtime Super Admin ; pas de relance de connexion > 2 tentatives ; pas de sondage < 5 s).

## 1. Accès ordinateur sans nom de domaine (IDEA-073)
- Aucune adresse à acheter : l'ordinateur ouvre l'URL canonique `https://adelkhatra-bit.github.io/KEEP/` (GitHub Pages). Elle affiche l'écran « Connexion ordinateur » avec un QR (`keep-web-pairing`, `web_pairings`).
- Le téléphone scanne le QR (appareil photo du téléphone → lien profond Loki, ou scanner intégré), approuve ; l'ordinateur reçoit la session et arrive dans le profil.
- État réel (audit 04/10) : 23 QR créés, 0 approuvé. Aucune bibliothèque de scan n'est dans `packages/mobile/package.json` : un scanner intégré (`expo-camera`) exige un **build natif** ; sans lui, il faut que le lien profond du QR ouvre l'app. À trancher avec Adel + à tester sur iPhone réel.

## 2. Double connexion + localisation (IDEA-074)
- Source : `web_companion_sessions` (+ une table d'appareils téléphone à ajouter, additive) avec ville/pays déduits de l'IP côté serveur (jamais l'adresse complète stockée en clair côté client).
- Quand une 2e session active d'un même compte apparaît : notification « Connexion sur un 2e appareil — <ville> » avec bouton **Se déconnecter** (révoque cette session précise, `revokeWebCompanionSession` existe déjà). L'utilisateur décide.
- Règle de repli : une nouvelle connexion ordinateur révoque l'ancienne session ordinateur automatiquement.

## 3. Google + informations manquantes (IDEA-075)
- Bouton « Continuer avec Google » (Supabase OAuth, navigateur système) : pseudo/e-mail/photo repris automatiquement.
- Popup « Informations manquantes » limitée à **Homme / Femme** (deux choix seulement), pas d'âge, rien d'autre. Compte créé seulement avec e-mail vérifié (règle du 01/09).
- Prérequis hors code : client OAuth Google (Google Cloud) + activation du fournisseur dans Supabase Auth — action d'Adel.

## 4. Authenticator (TOTP) + sécurisation (IDEA-076)
- Facultatif, activable depuis le profil (Supabase MFA TOTP : enroll → QR → code à 6 chiffres).
- Connexion jugée inhabituelle (nouvelle ville/pays, appareil inconnu) → notification « Sécurisez votre compte » ouvrant directement l'activation.
- Le login ne doit jamais devenir plus lent ni relancer des requêtes (incident 02/10) : l'étape MFA se fait après la session, sans nouvel appel réseau en boucle.

## Ordre proposé
1) Réparer le flux QR (mesurer pourquoi 0 approbation). 2) Registre d'appareils + notification « connecté 2 fois » + bouton. 3) Google + choix Homme/Femme. 4) TOTP + notification de sécurisation. Chaque étape : migration additive, test navigateur 390×844 et 1440×900, contrat produit mis à jour dans le même commit.
