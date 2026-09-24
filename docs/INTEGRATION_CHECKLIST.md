# INTEGRATION CHECKLIST — protocole unique pour tous les agents

Date : 24/09/2026

## Avant de commencer

1. Vérifier le repo : `adelkhatra-bit/KEEP`.
2. Vérifier la branche : `reconcile/claude-main-20260825`.
3. Lire `AGENTS.md`, `PROJECT_STATE.md`, `.context/activeContext.md`.
4. Lire `docs/CODE_GPS.md` et `docs/ERROR_LEDGER.md`.
5. Lire les derniers messages de `AGENT_MESSAGES.md`.
6. Vérifier le HEAD et les 10 derniers commits.
7. Vérifier le verrou agent (`scripts/agent-lock.cjs`) si l'agent a un terminal.
8. Chercher si la fonction existe déjà avant de créer quoi que ce soit.

## Avant chaque fichier modifié

- Quel est son propriétaire fonctionnel ?
- Un autre agent vient-il de le toucher ?
- Le changement peut-il être fait dans un service/composant existant plutôt que dans l'écran ?
- Les données sont-elles serveur ou seulement UI ?
- Existe-t-il déjà un test de contrat qui va casser ?
- Une erreur similaire existe-t-elle dans `ERROR_LEDGER.md` ?

## Intégration UI — ordre obligatoire actuel

1. Profil visité.
2. Profil propriétaire.
3. MyMusic / Playlists.
4. PlaylistSalePanel.
5. Onboarding.
6. Super Admin.
7. Tests 390×844 + desktop/web.
8. Seulement ensuite build natif si nécessaire.

Référence design :
- `docs/PROFILE_STYLE_COMMERCE_REDESIGN.md`
- `docs/mockups/ProfileStylesMarketplace.html`
- `docs/audit/AUDIT_UX_FUNNEL_20260924.md`

## Tests minimum par type de modification

### TypeScript / UI mobile
```bash
npx tsc --noEmit -p packages/mobile
npm test --workspace packages/mobile --if-present
git diff --check
```

### Moteur musique
```bash
npm test --workspace packages/music --if-present
npm run type-check --workspace packages/music --if-present
```

### Web
- démarrer le serveur canonique ;
- charger l'écran ;
- vérifier console ;
- tester 390×844 ;
- tester refresh/deep-link si la route est concernée.

### Supabase
- nouvelle migration uniquement ;
- jamais modifier une migration déjà appliquée pour "corriger l'histoire" ;
- vérifier RLS / grants / SECURITY DEFINER ;
- tester anon/authenticated/service_role selon le cas.

### iOS/Android
- ne lancer un build natif que pour une modification native/deps/config, ou release voulue ;
- JS pur : Web + OTA d'abord ;
- ne jamais contourner une erreur de signature en régénérant aveuglément les ressources Apple.

## Règle des tests existants

Un test rouge après une refonte peut être :
1. une vraie régression ;
2. un test devenu obsolète.

Il est interdit de simplement supprimer le test.  
Il faut documenter dans `ERROR_LEDGER.md` :
- pourquoi il est obsolète ;
- quelle nouvelle règle produit le remplace ;
- quelles assertions de sécurité doivent rester.

## Après chaque erreur trouvée

**Avant ou dans le même commit que le fix :**
- ajouter une entrée au `ERROR_LEDGER.md`;
- noter la cause racine, pas seulement le symptôme ;
- ajouter la prévention ;
- lier SHA/test/run.

## Après chaque intégration

Poster dans `AGENT_MESSAGES.md` :
- agent ;
- fichier(s) modifié(s) ;
- SHA ;
- ce qui a été intégré ;
- ce qui n'a PAS été touché ;
- tests exécutés avec résultat ;
- erreurs encore ouvertes ;
- prochain propriétaire.

## Définition de "terminé"

Une intégration n'est terminée que si :
- elle est sur la branche unique ;
- aucune fonction existante importante n'a disparu ;
- TypeScript passe ;
- tests ciblés passent ;
- le rendu 390×844 a été vérifié pour une UI mobile ;
- les données persistent après reload si elles doivent être durables ;
- `ERROR_LEDGER.md` est à jour ;
- `AGENT_MESSAGES.md` contient le handoff ;
- le statut réel (codé/testé/déployé) est clair.
