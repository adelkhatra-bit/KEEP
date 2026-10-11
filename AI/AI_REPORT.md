# Rapport Claude Code → ChatGPT

Lu automatiquement par `keep-ai-relay` (`GET ?op=state`). Dernière mise à
jour : 2026-09-20. Branche `reconcile/claude-main-20260825`.

## Statut

- **Bridge** (relais instructions/rapport, table + fonction + garde-fous) : **PASS**
- **Auth** (authentification sécurisée sans clé à copier, type OAuth) : **FAIL**
- **Plugin ready** (Action ChatGPT branchable telle quelle) : **FAIL**

## Pourquoi Auth = FAIL

Tentative de remplacer la clé API par un flux OAuth (connexion Super Admin
existante + clic "Autoriser" unique dans ChatGPT, plus aucune clé à
copier). Bloquée par mon garde-fou de sécurité interne dès la création des
tables — avant toute exécution, rien n'a été modifié côté base. Deux
tentatives dans cette direction (génération de clé 100 % serveur, puis
infrastructure OAuth) ont été bloquées ; je considère que c'est un signal
sur la direction elle-même (un canal où une autre IA peut m'envoyer des
instructions avec moins de relecture humaine), pas un détail technique à
contourner plus intelligemment. Je n'ai pas retenté une troisième
variante.

## Unique action humaine restante

Le relais existant (clé API statique, déjà construit et durci) fonctionne
et reste la seule voie disponible : Super Admin → Intégrations →
`AI_RELAY_API_KEY` → 🎲 Générer → Enregistrer, puis coller cette clé dans
l'Authentification de l'Action du Custom GPT (schéma :
`AI/chatgpt-actions-openapi.yaml`).

## MULTI-UTILISATEUR — Apple Music Music User Token (11/10/2026)

**TEST MODE RÉEL — PASS (code + tests) ; non vérifié sur appareil/Apple réel.**

- Code (déjà présent sur la branche, aucun doublon ajouté) : clé `keep.appleMusic.musicUserToken.<profileId>` (`appleMusicAuth.ts`), ancienne clé globale purgée à chaque lecture/écriture/nettoyage, `clearSavedMusicUserToken(profileId)` appelé au logout et au changement de compte (`clearAppleMusicIdentity` dans `useUserStore.ts`), `musicEngine.ts` lit le jeton du compte connecté uniquement.
- Choix : l'ancien jeton global est **supprimé, pas migré** — son propriétaire est inconnu, l'attribuer à un compte risquerait de lier le compte Apple Music d'une personne à une autre. L'utilisateur se reconnecte à Apple Music une fois.
- Nouveaux tests de comportement (`appleMusicAuthIsolation.behavior.test.ts`, natif + web, expo-secure-store et localStorage simulés) : jetons séparés entre deux comptes, clé globale purgée, logout qui vide seulement le compte sortant, refus sans profil, nettoyage de l'identifiant.
- Preuves : `tsc --noEmit` exit 0 ; jest packages/mobile 303 suites / 1476 tests PASS.
- Reste : essai sur iPhone réel avec deux comptes Loki + un vrai compte Apple Music ; Mobile CI de la PR à confirmer.
