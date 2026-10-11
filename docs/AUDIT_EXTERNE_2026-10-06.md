# Audit externe du 06/10/2026 — résumé fidèle (source : rapport « Audit_Loki_Music_2026-10-06 » fourni par Adel)

Audit en lecture seule (aucun code, design, Supabase ou déploiement modifié) : 1 668 fichiers inventoriés, 265 appels serveur comparés à la base réelle. **Pas une certification ligne à ligne, ni un test physique de tous les boutons.**

## Constats de fonctionnement (à ne pas reconstruire)
Stories (24 h, ordre, provenance, vues, chapitres, classement), réactions ❤ 😐 👎, recommandations, « Mon oreille », robot, économie FREE (compteurs serveur, série, parrainage, 3 packs), profil persistant, Super Admin (utilisateurs, prix, quotas, intégrations, support, modération, comptabilité), livraison web + OTA + TestFlight. Certains documents disent encore « à implémenter » pour des fonctions déjà livrées : ne pas les reconstruire.

## Chiffres réels relevés (comptes de test possibles)
17 profils · 0 nouveau profil sur 7 jours · 9 profils actifs · 154 musiques gardées au total · 27 abonnements · 3 parrainages qualifiés · 4 formules Premium/Creator/Venue **toutes offertes par l'admin** · 0 transaction d'abonnement ou de recharge · 0 coût d'exploitation saisi · 770 notifications non lues sur 912 (84,4 %) · 29 sessions de vues de story, 2 spectateurs distincts · **185 demandes QR ordinateur, 0 approbation**.

## Problèmes confirmés (par priorité)
1. **Son iPhone** : 7 erreurs `PREVIEW_PLAY_FAILED` + 3 signalements ; cause exacte à reproduire sur appareil (pistes : attentes réseau, reprises de lecture).
2. **Achats Apple réels bloqués** : le vérificateur omet `appAppleId` (exigé en production) et l'erreur est interceptée ; un achat TestFlight peut passer sans prouver la production.
3. **`keep_event_playlist` absente** de la base (liste de soirée vide sans message).
4. **QR ordinateur** : aucune session réussie ; parcours scan → approbation → connexion à prouver.
5. **Push** : sur 7 jours, 2 livrées, 18 échecs APNs `BadEnvironmentKeyInToken`, 309 sans appareil enregistré.
6. **Super Admin trompeur** : « payants actifs » compte les formules offertes ; transactions Sandbox possiblement comptées en revenu ; coûts vides = rentabilité inconnue.
7. **Statistiques incomplètes** : défi « Réagir à 20 » (corrigé le 06/10) ; table de tentatives de reconnaissance vide (pas de taux de réussite fiable).

## Écart de livraison
Site public = SHA audité `3ea86e50` ; build iOS 407 basé sur `dcc48995` (les erreurs audio viennent de ce build) ; mêmes sources, versions différentes. 3 contrôles de parcours échouent (entrée/navigation, accès Tchat, notification musicale) : causes à qualifier (sessions de test ou vrais bugs).

## Avis commercial
Proposition cohérente (communauté musicale, découvreurs) mais **rentabilité non démontrée** : aucune vente, aucune inscription en 7 jours, coûts non saisis, hypothèses de conversion non mesurées. Scénario interne +1 245 €/mois à 10 000 actifs, mais −861 à −3 165 €/mois si le coût des gratuits change.

## Reste à terminer (demandes d'Adel)
Son iPhone, achats Apple, QR ordinateur, playlist de soirée, notifications, vérification complète mobile/ordinateur (persistance du profil, micro, clavier, chat) ; Google, double connexion avec alerte, Authenticator, achat dans les stories, collections complètes en story, statistiques de communauté dans le Super Admin, textes commerciaux.
