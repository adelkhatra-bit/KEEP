# ERROR LEDGER — mémoire anti-régression Loki Music

Date de référence : 24/09/2026

## Règle

**Toute erreur réelle trouvée doit être inscrite ici.** Une erreur ne disparaît pas du registre quand elle est corrigée : elle passe à `VERIFIED` avec sa cause, son fix et la preuve qui empêchent sa réapparition.

Statuts :
- `OPEN` : problème présent.
- `FIXED_UNVERIFIED` : correctif présent mais preuve complète manquante.
- `VERIFIED` : correctif + test/preuve.
- `EXTERNAL_BLOCKER` : dépend d'un droit/service externe.

Chaque nouvelle entrée doit contenir :
`ID | date | zone | symptôme | cause racine | fix | prévention | preuve | statut`.

## Registre actuel

| ID | Zone | Symptôme / cause racine | Fix / prévention | Preuve | Statut |
|---|---|---|---|---|
| ERR-TS-001 | Parties | `PartiesScreen.tsx` cassait le typecheck : objet optimiste différent de `CreatorEvent`, puis `user` nullable. | Aligner l'objet sur le type du service ; ne jamais ajouter de props inventées ; gérer les nullables sans `any`. Commits de correction : `dc81f626`, `7eeb436`, `3a22bac`. | Refaire `npx tsc --noEmit -p packages/mobile` après chaque refonte Parties. | FIXED_UNVERIFIED |
| ERR-IOS-401-SHARE | iOS | EAS tentait d'enregistrer `com.adelkhatra.keep.share-extension` et tombait en 401/non-interactif. | Share Extension retirée temporairement du premier build TestFlight. Ne pas la réintroduire sans Bundle ID + provisioning dédiés prêts. | App Store native preflight du 24/09 : projet iOS généré/compilé sans Share Extension. | VERIFIED |
| ERR-IOS-403-BOOTSTRAP | iOS | Clé ASC valide en lecture (200) mais 403 sur mutation Developer Portal (capabilities). | Bootstrap rendu non destructif/read-only ; ressources existantes seulement ; `--freeze-credentials`. | Plus de mutation Apple autorisée par la CI ; full cloud build à confirmer. | FIXED_UNVERIFIED |
| ERR-IOS-TEAMID | iOS | Dernier EAS : `Failed to authenticate ... Failed to display prompt: Apple Team ID`. | Ne pas recréer les credentials. Vérifier que l'auth EAS production possède Team ID/ASC utilisables sans prompt. | Run EAS `35941499191` encore rouge. | OPEN |
| ERR-CI-PAGES-001 | Web/CI | `verify-source-of-truth.cjs` échoue : `PUBLIC DEPLOY CAPABILITY MISSING: playlist sale deep link`. | Restaurer le marqueur/capacité `playlist-sale` dans le workflow Pages canonique, sans créer un second site. | Runs Mobile CI/Web/Full-stack du 24/09 rouges sur ce contrôle. | OPEN |
| ERR-ANDROID-RES-001 | Android | Expo notifications refuse la ressource `keep-money` : tiret invalide pour Android. | Renommer la ressource native en identifiant Android valide (`keep_money`) à la source de config, pas seulement dans le workflow. | Run Android `35941499122` rouge. | OPEN |
| ERR-WEB-RUNTIME-001 | Web test | Audit Chromium ne trouve pas le serveur sur `127.0.0.1:8081`. | Diagnostiquer le démarrage Expo avant le test navigateur ; ne pas augmenter arbitrairement les sleeps. | Run `35941499089` rouge. | OPEN |
| ERR-PROFILE-SALE-001 | Profil vente | Dossiers verrouillés pouvaient utiliser `saleOffers[0]` comme offre/prix global. | Chaque dossier doit pointer vers son offre exacte. Commit `a9ddb531`. Ajouter test multi-offres. | Code corrigé ; test multi-offres encore à ajouter. | FIXED_UNVERIFIED |
| ERR-PROFILE-SCALE-001 | Profil UX | Longue liste de morceaux devient inutilisable à grande échelle. | Styles/Smart Albums en vue principale ; `Voir tous les morceaux` secondaire. Références design + commits `654ed541` / `ca41db86`. | Intégration partielle ; validation 390×844 restante. | FIXED_UNVERIFIED |
| ERR-TEST-PROFILE-001 | Tests | `PublicUserProfileScreen.redesign.test.ts` attend encore l'ancien onglet `Musiques` et l'ancienne vitrine boutique. | Mettre le test à jour vers le design validé **sans supprimer les assertions de sécurité/visibilité**. | Fichier de test lu le 24/09 ; attentes obsolètes. | OPEN |
| ERR-AGENT-BRANCH-001 | Coordination | Risque de corrections sur `main` / branches anciennes ou écrasement entre agents. | Branche unique `reconcile/claude-main-20260825`; lock + HEAD check + `AGENT_MESSAGES.md` avant edit. | Handoff `5178f8e` + contexte `6e32bfe`. | VERIFIED |

## Erreurs interdites à réintroduire

1. `saleOffers[0]` comme source universelle d'une collection payante.
2. Nouvelle Share Extension dans le build v1 sans préparation Apple dédiée.
3. Mutation automatique du Developer Portal Apple avec la clé ASC actuelle.
4. Nouvelle couleur UI en dur lorsqu'un token `colors.ts` existe.
5. Nouvelle longue liste musicale comme vue principale du profil.
6. Donnée profil uniquement locale sans persistance Supabase.
7. Refresh manuel requis après création/vente/déblocage.
8. Nouveau moteur de genres alors que Smart Albums existe.
9. Push UI sans vérifier la branche/HEAD et les changements d'un autre agent.
10. Déclarer `PASS` avec une CI rouge sans expliquer précisément si le rouge est causé ou non par le commit.

## Fermeture d'une erreur

Pour passer une ligne à `VERIFIED` :
1. cause racine identifiée ;
2. fix commité ;
3. test de non-régression ajouté ou preuve reproductible ;
4. CI ciblée verte, ou preuve locale + blocage externe distinct documenté ;
5. SHA et run consignés ici.
