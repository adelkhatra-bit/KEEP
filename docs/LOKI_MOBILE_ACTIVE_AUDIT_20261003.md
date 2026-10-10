# Loki mobile — audit actif 2026-10-03

Branche unique : `reconcile/claude-main-20260825`

## Corrigé dans cette session
- App Store Connect : Game Center désactivé.
- App Store Connect : Content Rights renseigné.
- App Store Connect : contact App Review renseigné.
- App Store Connect : tarification configurée.
- Battle Supabase : invitations PENDING limitées à 90 s au lieu de 100 ans.
- Battle : reprise automatique d'une arène ACTIVE après sortie accidentelle / retour au premier plan.
- Battle : navigation accidentelle bloquée pendant un Battle en ligne ; vraie sortie uniquement via QUITTER LE BATTLE.
- Battle : doublon de surfaces ACCEPTER/REFUSER supprimé entre écran Soirées et bannière globale.
- Battle : transition de manche accélérée dès que tous les joueurs ont répondu.
- Battle mobile : jaquette carrée agrandie et grille de 4 réponses descendue vers le bas.
- Diagnostic push : majorité des envois = NO_DEVICE ; le seul token iOS testé renvoie BadEnvironmentKeyInToken.
- Apple Bundle ID : capability PUSH_NOTIFICATIONS confirmée active.

## À terminer / vérifier
- Régénérer ou rattacher une Push Notification Key APNs valide dans Expo/EAS, puis reconstruire TestFlight.
- Vérifier qu'après nouvelle build plusieurs comptes iPhone créent chacun une ligne dans push_tokens.
- Vérifier push app fermée : Battle, message/chat, nouveau morceau, paiement.
- Vérifier absence de doublons de notifications sur une fenêtre courte pour un même événement.
- Vérifier notifications « nouveau morceau » : écoute possible puis GARDER/PASSER selon contrat existant.
- Installer et brancher expo-speech natif pour que Loki parle réellement sur iOS/Android.
- Vérifier continuité audio Battle sur iPhone et redémarrage de la manche suivante.
- Vérifier invitations Battle multi-utilisateurs : acceptation/refus/expiration sans refus fantôme.
- Nettoyer le lot de captures App Store 6,5 pouces (anciens doublons).
- Rejouer test mobile 390×844 complet après build.
