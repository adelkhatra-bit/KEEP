# Loki Music — audit mobile actif — 2026-10-03

Branche unique : `reconcile/claude-main-20260825`

## Règles de protection
- Ne pas modifier `packages/mobile/App.tsx` pour le responsive.
- Ne pas modifier `Navigation.tsx`, la barre des 5 onglets ni le design global validé.
- Toute sortie volontaire d'un Battle actif passe par la vraie action serveur `QUITTER LE BATTLE`.

## Battle multijoueur
- [x] Corrigé : invitations PENDING qui expiraient à +100 ans. Trigger Supabase ramené au TTL réel (90 s max) et vieux PENDING nettoyés.
- [x] Corrigé : sortie/changement d'onglet accidentel ne doit plus faire oublier un Battle EN LIGNE.
- [x] Corrigé : identité `activeArenaId` persistée tant que le siège serveur reste ACTIVE.
- [x] Corrigé : reprise automatique de l'arène active au retour sur Soirées / focus / foreground.
- [x] Corrigé : doublons de surface ACCEPTER/REFUSER entre notification globale et écran Battle.
- [ ] Test physique multi-utilisateurs à revalider après distribution de la dernière build/OTA.

## Battle Solo / audio / design
- [x] Diagnostic réel : le passage au morceau suivant attendait volontairement la fin théorique des 10 s après une réponse.
- [x] Corrigé : après réponse, résultat visible ~1,4 s puis morceau suivant immédiatement.
- [x] Corrigé : si Écouter utilise déjà le micro, seule la capture micro est suspendue pendant le Battle puis reprise automatiquement ; la session et ses morceaux sont conservés.
- [x] Corrigé : jaquette Solo agrandie en carré, grille de 4 réponses descendue.
- [ ] Revalider sur TestFlight réel : morceau 1 -> réponse rapide -> morceau 2 audible immédiatement, puis 8 manches.

## Notifications externes iOS / app fermée
- [x] Enregistrement Expo Push Token présent côté client et monté globalement.
- [x] Worker serveur Expo Push + lecture des receipts présents.
- [x] Diagnostic réel 2026-10-03 : 180 tentatives NO_DEVICE sur 24 h ; un token iOS `adel4A` enregistré vers 23:10 Europe/Paris.
- [x] Diagnostic réel après token : Expo accepte le message mais APNs renvoie `BadEnvironmentKeyInToken` HTTP 403.
- [ ] Corriger/réassocier la clé APNs de production du projet EAS `f9598ced-2480-4fa6-8d6e-885dd4e489e8` / bundle `com.adelkhatra.keep`.
- [ ] Prouver une notification `DELIVERED` sur appareil iOS avec Loki fermé.
- [ ] Vérifier que chaque compte/appareil de test possède son propre token actif.

## App Store Connect
- [x] Game Center inutilisé désactivé sur la version 1.0.0.
- [x] Content Rights renseignés.
- [x] Contact App Review renseigné.
- [x] Tarification : territoire de base + prix présents.
- [x] Captures iPhone 6,5" générées au format Apple accepté.
- [ ] Nettoyage/validation finale du set de captures App Store après stabilisation des écrans Battle.

## À ne jamais oublier
À chaque nouveau retour de test : ajouter le symptôme ici s'il n'est pas résolu dans le même passage, avec preuve serveur/CI lorsque possible.


## Notifications : réduction du bruit
- [x] Diagnostic volume 24 h : confirmations Battle ACCEPTED/DECLINED contribuaient au bruit sans action utile.
- [x] Fonction Battle serveur actuelle : ne crée déjà plus de nouvelles notifications ACCEPTED/DECLINED.
- [x] Worker push durci : `BATTLE_CHALLENGE_ACCEPTED` et `BATTLE_CHALLENGE_DECLINED` restent in-app-only si un ancien chemin les recrée.
- [x] Anciennes entrées ACCEPTED/DECLINED nettoyées côté production (aucune restante au contrôle).
- [ ] Conserver en push uniquement les événements Battle utiles : invitation/action requise, éventuellement fin de Battle/gain selon validation produit.

## Audit TestFlight vs branche validée
- [x] Production OTA active : plusieurs correctifs JS sont publiés sans nouveau binaire.
- [x] Push externe TestFlight : blocage natif/credential confirmé par APNs `BadEnvironmentKeyInToken`.
- [ ] Identifier le dernier binaire iOS réellement installé/TestFlight et son commit natif.
- [ ] Comparer les modules natifs ajoutés/modifiés après ce binaire (notifications, TTS/audio, ShazamKit, StoreKit, partage, etc.).
- [ ] Rebuild TestFlight de production une fois le snapshot mobile stabilisé.
- [ ] Exécuter le parcours physique complet module par module sur ce nouveau binaire.
