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
| ERR-CI-PAGES-001 | Web/CI | `verify-source-of-truth.cjs` échoue : `PUBLIC DEPLOY CAPABILITY MISSING: playlist sale deep link`. Cause auditée : `05f4c17a` a retiré les routes/shells/smokes `playlist-sale`. | Abacus-Claude a préparé la restauration additive et prouvé `verify-source-of-truth` GREEN localement. Le push de `.github/workflows/web-preview-pages.yml` reste bloqué par `Workflows:write=403`. | Audit agent `780e011`; fix local non poussé. | EXTERNAL_BLOCKER |
| ERR-ANDROID-RES-001 | Android | Expo notifications refusait `keep-money.wav` : tiret invalide pour Android. | Générateur/config/push utilisent `keep_money.wav`. | Run Android `35945911165` vert ; contrat Jest aligné sur le nom Android valide. | VERIFIED |
| ERR-WEB-RUNTIME-001 | Web test | Les audits supposaient que `/KEEP/` restait sur la racine et que le bouton d’essai restait visible, alors que l’architecture zéro-friction entre automatiquement dans `/Main/Listen`. | Accepter l’entrée auto ou le bouton de repli ; garder les 5 onglets et le profil partagé comme preuves. | Cause visible dans `35945858034` / `35945858036`. | FIXED_UNVERIFIED |
| ERR-PROFILE-SALE-001 | Profil vente | Dossiers verrouillés pouvaient utiliser `saleOffers[0]` comme offre/prix global. | Chaque dossier doit pointer vers son offre exacte. Commit `a9ddb531`. Ajouter test multi-offres. | Code corrigé ; test multi-offres encore à ajouter. | FIXED_UNVERIFIED |
| ERR-PROFILE-SCALE-001 | Profil UX | Longue liste de morceaux devient inutilisable à grande échelle. | Styles/Smart Albums en vue principale ; `Voir tous les morceaux` secondaire. Références design + commits `654ed541` / `ca41db86`. | Intégration partielle ; validation 390×844 restante. | FIXED_UNVERIFIED |
| ERR-TEST-PROFILE-001 | Tests | Plusieurs contrats profil sont devenus rouges : `Musiques`→`Styles`, liste plate devenue secondaire, API du StyleTile/preview changée. Deux tests protègent toutefois de vraies fonctions disparues (boutique/empty-state) et ne doivent pas être supprimés. | Aligner uniquement les attentes devenues obsolètes ; conserver/restaurer les assertions fonctionnelles marketplace. | Audit Abacus-Claude `780e011`. | OPEN |
| ERR-PROFILE-MARKETPLACE-002 | Profil vente | La refonte a retiré la section explicite `Découvertes à débloquer` et l'empty-state `Pas encore de musique en vente`. Cela viole la règle utilisateur **rien ne doit manquer**. | **Décision 24/09 : restaurer additivement ces fonctions**, mais les intégrer dans la nouvelle architecture Styles (section compacte, sans recréer une longue liste). Les cartes verrouillées ne remplacent pas la capacité/empty-state ; elles la complètent. | Arbitrage ChatGPT→agent à consigner dans `AGENT_MESSAGES.md`, puis Jest doit redevenir vert. | OPEN |
| ERR-PROFILE-GUARD-001 | Profil/tests | `verify-profile-hierarchy.cjs` utilisait les anciens libellés d'accessibilité et cassait après `Inviter / Partager` + `Prévisualiser mon univers`. | Aligner le guard sur les libellés validés sans supprimer les vérifications d'existence des boutons. | Abacus-Claude annonce guard PASS localement dans `780e011`; push à confirmer. | FIXED_UNVERIFIED |
| ERR-DESIGN-TOKEN-001 | Design | `ownerSellButton` contient encore `rgba(45,225,194,.12)` en dur. | Lors de l'étape `PlaylistSalePanel`/tokens, remplacer les couleurs hardcodées de la zone commerce par les tokens existants, sans changer le rendu. | Audit agent `780e011`. | OPEN |
| ERR-MARKETPLACE-TEST-003 | Tests marketplace | Le contrat cherchait encore `isFeatureEnabled('playlist_marketplace')` après le hard-gate natif App Store. | Vérifier le focus via `isPlaylistMarketplaceEnabled()` : web + flag Super Admin, natif toujours false. | Run `35945858065` : 4 attentes obsolètes identifiées. | FIXED_UNVERIFIED |
| ERR-APPSTORE-PRECHECK-001 | App Store | Le workflow App Store lançait la lane Fastlane `precheck` dont le corps appelait `precheck`, ce qui rappelait récursivement la même lane jusqu’à `SystemStackError`. | Renommer la lane Fastlane en `validate` et mapper l’entrée workflow `precheck` vers `validate`. | Run `35974040360` reproduit la récursion ; correctifs `164730be` + `0ce54b9a`. | FIXED_UNVERIFIED |
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
