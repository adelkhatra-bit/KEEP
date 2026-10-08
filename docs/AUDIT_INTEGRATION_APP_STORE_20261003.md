# Loki Music — Audit intégration App Store et production

Date : 03/10/2026  
Branche unique : `reconcile/claude-main-20260825`

## Résumé exécutif

Le socle applicatif est solide et la CI du HEAD audité est verte, mais la soumission App Store ne doit pas être considérée comme totalement sécurisée tant que les points externes ci-dessous ne sont pas validés sur un vrai iPhone/TestFlight.

Les trois zones encore critiques sont :
1. Tchat : validation physique iPhone du clavier + temps réel, même si les correctifs source et serveur sont présents.
2. Reconnaissance musicale : ShazamKit iOS est le meilleur rail actuel, mais AudD est absent et ACRCloud est à quota épuisé. La mémoire Loki ne couvre encore qu'une petite fraction du catalogue.
3. E-mails / achats : Brevo est encore bloqué par l'allowlist IP ; les produits IAP doivent être confirmés dans App Store Connect et testés en sandbox/TestFlight.

## 1. TCHAT — audit

### Temps réel

État source :
- Direct : abonnement Supabase Realtime sur les messages entrants ET les messages envoyés depuis un autre appareil du même compte.
- Groupes : abonnement Realtime sur `music_agora_group_messages`.
- La Place : abonnement Realtime sur `music_agora_messages`.
- Filet de sécurité : rafraîchissement silencieux périodique du fil ouvert si le websocket mobile est suspendu.
- Retour au premier plan : rafraîchissement immédiat du fil et de la boîte de réception.

État Supabase :
- `music_agora_messages`, `music_agora_group_messages` et `music_agora_group_members` sont bien dans la publication `supabase_realtime`.

Conclusion :
- Le problème « je dois fermer/réouvrir pour voir la réponse » n'est pas un manque d'architecture temps réel dans le HEAD actuel.
- Il reste à certifier le comportement sur deux vrais appareils avec la build TestFlight finale.

### Clavier iPhone / Android

Correctifs présents :
- focus immédiat du composeur sans attendre le chargement réseau ;
- plusieurs tentatives de focus après l'animation native ;
- suivi de `keyboardWillShow` et `keyboardWillChangeFrame` sur iOS ;
- déplacement du panneau au-dessus du clavier natif ;
- Android configuré en `softwareKeyboardLayoutMode=resize` ;
- protection contre le double déplacement clavier.

Test obligatoire avant soumission :
- iPhone 390×844 : ouvrir un direct → clavier doit apparaître au premier toucher ;
- La Place → même comportement ;
- fermer/réouvrir clavier 10 fois ;
- passer direct → La Place → groupe → direct ;
- vérifier qu'aucun champ ne passe derrière le clavier.

### Réponse attachée façon WhatsApp

Backend et UI sont déjà câblés :
- colonnes `reply_to_message_id` présentes pour directs/public et groupes ;
- RPC `keep_agora_post_message_v5` valide que le message cité appartient au bon fil ;
- RPC directs/public et groupes renvoient `reply_to_username` + `reply_to_body` ;
- l'UI envoie `replyToMessageId` ;
- l'UI affiche une citation au-dessus du nouveau message.

Donc le modèle « Répondre à ce message » existe réellement dans le HEAD actuel.  
À tester en vrai sur :
- direct ;
- La Place ;
- groupe ;
- réponse à une réponse ;
- message long ;
- message supprimé/modéré.

## 2. RECONNAISSANCE MUSICALE — audit

### État réel des moteurs

- ShazamKit iOS : intégré en module natif, prioritaire sur iPhone.
- AudD : `NOT_CONFIGURED` dans l'état runtime actuel.
- ACRCloud : `EXHAUSTED` — quota fournisseur dépassé.
- Fallback Apple/Deezer par métadonnées : actif, mais ce n'est pas un moteur universel d'empreinte audio.
- Mémoire acoustique Loki : active.

État de la mémoire Loki observé :
- 274 morceaux fingerprintés ;
- environ 1,15 M de hashes acoustiques ;
- plus de 5 000 morceaux en base avec un extrait disponible.

Le problème est clair : la mémoire acoustique Loki ne couvre pas encore assez du catalogue disponible.

### Correctifs déjà présents

- fenêtres de capture iPhone renforcées après plusieurs non-match ;
- reprise rapide de ShazamKit après erreur transitoire ;
- ACRCloud quota épuisé détecté explicitement pour éviter une boucle de tentatives inutiles ;
- mémoire Loki testée avant les fournisseurs externes pour les titres déjà appris.

### Pour viser une reconnaissance quasi universelle

Ordre recommandé de production :
1. ShazamKit sur iPhone.
2. AudD réactivé avec un vrai compte/quota.
3. ACRCloud avec quota payé ou fournisseur secondaire équivalent.
4. Mémoire Loki auto-hébergée enrichie massivement.
5. Fallback métadonnées Apple/Deezer pour les liens/textes partagés.

Aucun système ne peut garantir littéralement 100 % de tous les sons du monde. Pour approcher ce niveau, Loki doit combiner plusieurs catalogues indépendants et faire grandir sa propre mémoire.

## 3. FILMS / SÉRIES — prochaine mise à jour

La demande est déjà intégrée au backlog, section « Films (V2) » :
- reconnaître film/série depuis dialogue, bande originale ou extrait audio ;
- ajouter film/série au profil ;
- marquer « aimé » ;
- construire un catalogue audiovisuel multi-sources ;
- notifier les abonnés.

À ne pas mélanger avec la soumission App Store actuelle : c'est une V2 séparée.

## 4. E-MAILS — audit production

Brevo :
- API key présente ;
- sender présent ;
- webhook token présent ;
- état runtime actuel : `ERROR` ;
- cause : allowlist IP Brevo bloque les sorties Supabase Edge Functions.

Resend :
- non configuré.

Mailjet :
- non configuré.

Événements de délivrabilité enregistrés :
- aucun événement actuellement dans `email_delivery_events`.

Conclusion :
- la logique applicative existe ;
- la délivrabilité réelle n'est PAS validée ;
- tant que Brevo garde l'allowlist IP actuelle ou qu'un fallback Resend/Mailjet n'est pas configuré, récupération de compte / e-mails critiques ne doivent pas être déclarés fiables à 100 %.

## 5. PAIEMENTS / APP STORE — audit

### Abonnements iOS

Le bon mécanisme pour des abonnements numériques iOS est StoreKit / In-App Purchase, pas Apple Pay direct.

Présent dans le code :
- StoreKit 2 natif `KeepIAP` ;
- achat ;
- restauration ;
- lecture des entitlements ;
- vérification serveur JWS Apple ;
- synchronisation Supabase ;
- fonction `keep-apple-notifications`.

IDs attendus :
- `com.adelkhatra.keep.premium.monthly`
- `com.adelkhatra.keep.creatorpro.monthly`
- `com.adelkhatra.keep.venuepro.monthly`

Reste obligatoire :
- confirmer que les 3 produits existent et sont configurés dans App Store Connect ;
- test sandbox/TestFlight achat ;
- test restauration sur un second appareil ;
- test renouvellement / expiration / révocation.

### Apple Pay

Il n'existe pas de rail Apple Pay direct dans l'app mobile actuelle. Ce n'est pas un défaut pour les abonnements numériques : Apple attend StoreKit IAP.

### Stripe

État live :
- `STRIPE_PUBLISHABLE_KEY` ressemble bien à une clé publique ;
- `STRIPE_SECRET_KEY` ressemble encore à une clé publique également.

Donc Stripe serveur n'est pas prêt.

### Paddle

Non configuré actuellement.

### PayPal / marketplace

Le paiement vendeur manuel/QR existe pour le web/flux marketplace, mais la marketplace est désactivée côté iOS et le flag production `playlist_marketplace` est actuellement OFF.  
C'est volontaire pour éviter le risque App Store 3.1.1 sur du contenu numérique débloqué par paiement externe.

## 6. APP STORE — pourquoi « refus » / blocage

Je n'ai trouvé aucun message officiel App Review indiquant un rejet déjà prononcé dans le dépôt.

Ce qui est documenté est un risque de rejet / une soumission volontairement retenue, principalement pour :
- marketplace numérique via paiement externe si elle était visible sur iOS ;
- e-mails non validés en production ;
- reconnaissance musicale pas encore assez fiable sans fournisseurs actifs ;
- achats IAP à valider réellement sur TestFlight ;
- éléments App Store Connect externes à confirmer.

La marketplace est désormais désactivée sur iOS et le flag production est OFF, ce qui retire le risque principal 3.1.1 de cette version.

## 7. État Apple technique vérifié

Le préflight Apple a déjà confirmé :
- accès App Store Connect API ;
- Bundle ID exact `com.adelkhatra.keep` ;
- certificat de distribution actif ;
- provisioning profile App Store actif ;
- module KeepShazam résolu par CocoaPods ;
- module KeepIAP résolu et compilé dans le build iOS.

Cela prouve la chaîne technique de build/signature, pas encore l'acceptation finale App Review ni le fonctionnement complet des achats réels.

## 8. Critères GO avant « Submit for Review »

Obligatoires :
- CI finale verte sur le SHA de soumission ;
- test physique iPhone complet ;
- tchat direct + La Place + groupe : clavier au premier toucher ;
- deux appareils : message entrant visible sans fermer/réouvrir ;
- réponse citée visible et attachée ;
- reconnaissance répétable sur plusieurs titres populaires + rares ;
- AudD actif OU autre deuxième moteur fiable disponible ;
- Brevo débloqué ou fallback e-mail configuré et un e-mail réel marqué livré ;
- 3 produits IAP vérifiés dans App Store Connect ;
- achat sandbox/TestFlight + restauration testés ;
- marketplace iOS toujours OFF ;
- compte reviewer réel ;
- captures App Store et métadonnées finales.

## 9. État du HEAD audité

HEAD observé pendant l'audit : `323eb499a40089efbec97dc4818af7b06cd85678`.

Sur ce HEAD :
- CI complète : SUCCESS ;
- Security guard : SUCCESS ;
- Data preservation : SUCCESS ;
- CodeQL : SUCCESS ;
- Human Guardian : SUCCESS ;
- Web public : SUCCESS.

Le prochain jalon n'est plus un gros changement de design. C'est une validation production réelle des trois points critiques : tchat physique, reconnaissance multi-moteurs, e-mails/IAP.
