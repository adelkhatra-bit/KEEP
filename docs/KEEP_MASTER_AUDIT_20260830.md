# KEEP — Audit maître robustesse, fonctions et coûts — 30/08/2026

Branche de vérité : `reconcile/claude-main-20260825`.

## Règles de non-régression

- Ne pas modifier le responsive de `packages/mobile/App.tsx`.
- Ne pas modifier `Navigation.tsx` ni la barre des 5 onglets.
- Conserver le design mobile validé.
- Battle : pas de swipe, trois réponses verticales, audio automatique, 10 secondes de réponse réelles.
- Invitation Battle dans la carte : jaquette -> invitation -> « Qui chante ? » -> réponses.

## 1. KEEP Battle

### Fonctionnel / verrouillé

- Catalogue global centralisé, thèmes stricts et packs de 8 manches.
- Preview audio chargée avant le chrono solo ; retry audio invisible.
- Multiplayer planifié sur le même timestamp serveur (`startedAt`) pour les clients.
- Une seule arène partagée lors d’un challenge accepté.
- Réponse challenge rendue idempotente : un retry ACCEPTER renvoie la même arène ; un retry REFUSER renvoie le même refus.
- Démarrage 1v1 exécuté côté serveur après acceptation, afin que les deux téléphones consomment le même état de manche.
- Jauge 1v1 inspirée des Battles LIVE : vrais pseudos, scores des deux côtés, une barre centrale.
- Cibles tactiles ACCEPTER / REFUSER agrandies pour smartphone et invitation intégrée à la carte.
- Groupe conservé après 8 manches ; revanche possible.
- Arènes configurées jusqu’à 10 joueurs.
- Invitation d’un joueur vers une arène WAITING existante, sans recréer un autre groupe.
- Verrouillage de mise en Free par joueur et par match ; minimum Free vérifié côté serveur.
- Pas d’élimination automatique pour une simple défaite ; la capacité financière de continuer reste la contrainte serveur.

### À valider physiquement

- Deux iPhone réels : acceptation simultanée, même morceau et même démarrage perceptible sur les deux appareils.
- Push Battle lorsque l’app est réellement en arrière-plan / téléphone verrouillé.
- Entrée successive de joueurs 3 à 10 sur plusieurs appareils physiques après une partie terminée.

## 2. Notifications et push

### Problèmes trouvés

- L’ancien worker push dépendait d’un serveur Express/Render réveillé et bouclait toutes les 15 secondes.
- 64 notifications étaient bloquées avec `pushed_at IS NULL`.
- Une fois le worker exécuté correctement, les 64 ont été classées `NO_DEVICE` : aucun token Expo valide n’était enregistré pour ces profils.
- Le token était enregistré via `EXPO_PUBLIC_API_URL -> Render -> /api/notifications/push-token`, donc Render ou une URL absente pouvait empêcher tout enregistrement appareil.

### Architecture corrigée

- `keep-push-worker` est une Supabase Edge Function.
- Supabase `pg_cron` + `pg_net` l’appellent toutes les 30 secondes.
- Clé interne générée dans Supabase Vault ; seul son hash est stocké dans une table RLS inaccessible à anon/authenticated.
- Claim SQL avec `FOR UPDATE SKIP LOCKED` pour empêcher les doubles traitements concurrents.
- Cycle Expo : CREATED -> SENT/NO_DEVICE/FAILED -> DELIVERED/FAILED.
- Tokens `DeviceNotRegistered` supprimés automatiquement.
- File vérifiée après bascule : 64 en attente -> 0 en attente.
- Worker Express conservé uniquement comme secours via `KEEP_PUSH_WORKER_FALLBACK=1`.
- RPC authentifiée `keep_push_token_register` / `keep_push_token_unregister` créée : le téléphone peut s’enregistrer directement dans Supabase sans Render.
- Un token Expo est réaffecté au profil actuellement connecté afin de ne pas rester associé à plusieurs comptes.
- Lifecycle global push monté dans `index.js`, hors `App.tsx` et hors Navigation.

## 3. Profil utilisateur

### Fonctionnel / persistant

- Pseudo, bio, photo/avatar, ville, pays, date de naissance, genre, réseaux sociaux, site web.
- `profiles`, `profile_private_info`, `social_links` utilisés réellement.
- Avatar dans Supabase Storage bucket `avatars` avec règles de dossier utilisateur.
- GPS natif/web, reverse geocoding, préremplissage ville/pays et modification manuelle.
- Liens sociaux ouvrables ; réseau absent -> message « Cette personne ne partage pas ce réseau ».

### Validation

- Contrat de persistance et reload déjà couvert par Guardian/CI ; conserver un test physique final avant release.

## 4. Écouter / microphone / reconnaissance

### Fonctionnel côté lifecycle

- Arrêt de session coupe `Audio.Recording`, libère la ressource et remet l’état inactif.
- Android Foreground Service gère l’écoute native ; arrêt coupe aussi ce service.
- iOS utilise ShazamKit en priorité lorsqu’il est disponible dans le build natif.
- Résolution sans clé de liens/textes partagés avant tout fournisseur payant : Apple Search + recoupement public Deezer.
- CI possède un smoke live sans clé pour texte + URL YouTube.

### Limite réelle restante

- AudD et ACRCloud ne sont pas configurés.
- Un navigateur/Android ne peut donc pas être présenté comme capable d’identifier gratuitement n’importe quel morceau ambiant mondial par empreinte audio.
- Stratégie coût minimum : ShazamKit pour iOS + résolveur keyless pour les liens ; construire un moteur/catalogue d’empreintes maison seulement pour les références que KEEP peut légalement indexer. Ne pas payer AudD/ACRCloud tant que cette couverture n’est pas indispensable.

## 5. Soirées / salons utilisateurs

- Le moteur Battle et les services de salons existent côté backend.
- La vraie liste publique des salons utilisateurs (hôte, avatar, thème, x/10, places, file, jackpot Free, profils participants, entrée directe) doit rester un point de release tant que son branchement UI n’est pas validé de bout en bout.
- Ne pas confondre « moteur d’arène présent » et « porte d’entrée Salon utilisateurs terminée ».

## 6. Réglages avancés / navigation

- Retour sans déconnexion et retour réel vers Playlists font partie du contrat mobile existant.
- Ne pas toucher à la navigation générale ou aux 5 onglets pour corriger des sous-écrans.

## 7. Super Admin

### Déjà structuré

- Contrats Super Admin -> utilisateur en CI.
- Gestion des intégrations et tests fournisseurs.
- Politique e-mail, délivrabilité et webhook Brevo.
- Remote config utilisée par l’app.
- Contrôle utilisateur et bootstrap admin via Edge Functions.

### À renforcer avant release

- Tableau unique de santé : Edge Functions, Cron, push backlog, e-mail, reconnaissance, catalog Battle, Storage, quotas Supabase.
- Alertes sur backlog push > 0 durable, erreurs Cron, fonctions en erreur, secrets fournisseurs absents.
- Boutons « tester réellement » pour les intégrations, pas seulement « configuré/non configuré ».

## 8. Réduction des outils payants

### GitHub — à exploiter au maximum

Repo public : utiliser les runners GitHub Actions standards pour CI, tests, exports, vérifications de contrats, migrations statiques, seed/refresh catalogue et audits. Éviter les larger runners payants. Activer/maintenir Dependabot et CodeQL sur le dépôt public. Utiliser les artifacts uniquement pour les sorties nécessaires et avec rétention courte.

GitHub Pages : uniquement pour contenu statique/public (share-profile, docs, pages publiques). Ne pas en faire l’hébergement SaaS principal de KEEP.

### Supabase — plateforme principale

- Postgres + RLS + RPC pour la logique atomique.
- Auth pour identité et sessions.
- Storage pour avatars/assets utilisateur appropriés.
- Realtime pour états live et invitations en foreground.
- Edge Functions pour intégrations externes, webhooks et workers.
- Cron + pg_net pour les tâches périodiques.
- Vault pour secrets internes utilisés par Cron.

Mesures observées pendant l’audit : base environ 20 MB, bucket avatars environ 6,68 MB ; marge très importante sous le plan gratuit actuel.

### Expo

- Expo Push Service : conserver pour le moment ; pas de coût d’envoi annoncé et limite largement suffisante au lancement.
- Si nécessaire à grande échelle, KEEP peut ultérieurement envoyer directement APNs/FCM avec les tokens natifs, sans réécrire l’application.

### Render / Vercel

- Render n’est plus requis pour le worker push ni pour l’enregistrement des tokens.
- Garder temporairement le backend Render gratuit pour les routes Express non encore migrées ; migrer progressivement les routes simples vers RPC/Edge Functions.
- Vercel ne doit pas être une dépendance bloquante de release ; les échecs/rate limits Vercel ne doivent pas faire échouer la logique mobile/Supabase.

### Reconnaissance musicale

- Priorité iOS : ShazamKit.
- Priorité liens partagés : résolveur KEEP sans clé.
- Fournisseurs AudD/ACRCloud uniquement comme fallback facultatif si besoin commercial de couverture non-iOS mondiale.
- Moteur maison possible pour un catalogue légal contrôlé, mais un moteur maison sans catalogue de référence ne remplace pas magiquement le catalogue mondial Shazam.

### E-mail

- Garder Brevo tant que le niveau gratuit couvre le besoin et que la délivrabilité est meilleure qu’un SMTP bricolé.
- La logique métier, événements de délivrabilité et templates doivent rester possédés par KEEP/Supabase afin de pouvoir changer de transport sans réécrire l’app.

## 9. CI / qualité / sécurité

- Full-stack CI : source de vérité, App Store contract, Super Admin -> user, installation, typecheck, tests, reconnaissance keyless live, backend build, admin build, export web.
- Data preservation contract protège les données utilisateur.
- Guardian mobile 390x844 reste obligatoire.
- Ajouter/maintenir CodeQL + Dependabot pour profiter des fonctions GitHub publiques gratuites.
- Dette connue : `npm audit` signale 30 vulnérabilités (15 moderate, 15 high). Elles doivent être triées sans `npm audit fix --force` aveugle avant release.

## 10. Blocages réels avant « tout fonctionne »

1. Validation physique de Battle sur deux appareils et montée à plusieurs joueurs.
2. Validation physique du nouveau token Expo après rebuild/reconnexion ; la base devra montrer un token valide au lieu de `NO_DEVICE`.
3. Salon utilisateurs : vérifier/terminer l’UI publique de découverte/entrée des salons.
4. Reconnaissance micro arbitraire hors iOS : pas de promesse mondiale sans fournisseur ou catalogue d’empreintes maison légal.
5. IAP/App Store : valider achat/receipt serveur et configuration App Store Connect avant soumission.
6. Trier les dépendances npm vulnérables.

Ce document doit être mis à jour avec des preuves (SHA, CI, requêtes de santé) et non avec des déclarations non testées.
