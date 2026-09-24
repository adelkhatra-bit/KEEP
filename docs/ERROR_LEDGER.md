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
| ERR-APPSTORE-IAP-PRECHECK-002 | App Store | Fastlane `precheck` avec clé App Store Connect API échoue sur le contrôle IAP, fonctionnalité non supportée par cette auth. | Exclure uniquement le contrôle IAP avec `include_in_app_purchases: false`; `deliver` utilise aussi `precheck_include_in_app_purchases: false`. Les autres règles de métadonnées restent actives. | Run `35974247733` : message Fastlane explicite ; documentation Fastlane confirme la limitation API Key/IAP. | FIXED_UNVERIFIED |
| ERR-GUARDIAN-PROFILE-004 | 390×844 guardian | Le Human Guardian cherchait encore le texte exact `PARTAGER` alors que le bouton propriétaire validé est désormais `INVITER / PARTAGER`; la fonction et l’accessibilityLabel étaient présentes. | Le test vise maintenant l’accessibilityLabel stable `Inviter ou partager mon profil`, sans modifier l’UI. | Runs `35973940285` / `35974247650` : tous les tests unitaires passent, timeout uniquement au marqueur obsolète. | FIXED_UNVERIFIED |
| ERR-APPSTORE-REVIEW-CONTACT-003 | App Store | La lane `listing` tentait de créer App Review Information alors que `contactEmail` et `contactPhone` réels ne sont pas encore fournis ; Apple exige les deux et un téléphone international `+...`. | Découpler la fiche publique : staging metadata sans `review_information` pour listing/captures. Les vraies coordonnées restent obligatoires uniquement avant soumission finale. | Run `35974802732` : métadonnées fr-FR uploadées, puis erreur Apple explicite sur contactEmail/contactPhone. | FIXED_UNVERIFIED |
| ERR-PROFILE-FLOW-003 | Profil UX | Sur profil visité, le bloc Loki DNA était rendu entre les onglets Styles/Artistes et leur contenu ; après un tap, le résultat apparaissait plus bas et donnait l'impression que le bouton ne répondait pas. Les offres en vente étaient résumées par un bloc générique sans CTA direct par produit. | Commit `c5f23cb2` : contenu d'onglet rendu immédiatement sous les onglets ; boutique affiche jusqu'à 3 vraies collections avec prix + CTA `ÉCOUTER UN APERÇU`. Commit `023bef34` : ventes et disponibilité Battle remontées sous le hero propriétaire. | CI typecheck/Jest/390×844 en cours sur les SHA correspondants. | FIXED_UNVERIFIED |
| ERR-PROFILE-ACTIONS-005 | Profil propriétaire | Les actions clés (vente et disponibilité Battle) étaient séparées du hero et dupliquées plus bas, obligeant à chercher les commandes essentielles dans un profil long. | Commit `9c7d46d8` : `Prévisualiser`, `Inviter / Partager`, `Vendre / Gérer mes ventes` + compteur d'offres et disponibilité Battle regroupés dans le hero ; aide et stats Battle restent juste sous le toggle. Test de contrat ajouté pour verrouiller cette proximité. | `ProfilePublicScreen.heroControls.contract.test.ts` + CI du SHA suivant. | FIXED_UNVERIFIED |
| ERR-TS-PROFILE-006 | Profil propriétaire / TypeScript | L’intégration du hero propriétaire utilisait `ownerBattleCard`, `ownerBattleCopy` et `ownerBattleSub` dans le JSX sans que ces styles aient été ajoutés au `StyleSheet`; la CI a donc cassé au typecheck. | Ajouter les trois styles avec les tokens existants et conserver un test de contrat sur le hero. Prévention : après toute refonte JSX, vérifier que chaque clé `s.*` nouvelle existe réellement avant push. | Runs `35986701817`, `35986701765`, `35986701916`, `35986702030` montrent TS2339 ; correctif dans le SHA suivant. | FIXED_UNVERIFIED |
| ERR-GUARD-ONBOARD-001 | Guardian/Web | Human Guardian exigeait `ESSAYER GRATUITEMENT` alors que l’onboarding validé démarre maintenant automatiquement l’essai invité. | Le test accepte les deux états : CTA encore visible ou essai déjà démarré. | À vérifier sur le prochain run Human Guardian. | FIXED_UNVERIFIED |
| ERR-GUARD-COACHMARK-001 | Guardian/Web | Un coachmark première visite peut intercepter temporairement les clics de navigation et faisait expirer Playwright alors que l’écran était visible. | Les guardians utilisent un clic robuste (attente/Escape/retry puis force en dernier recours) pour traverser ce coachmark sans masquer une vraie absence de bouton. | À vérifier sur Human/Dual/Real Browser. | FIXED_UNVERIFIED |
| ERR-PAGES-SLASH-001 | Web/Pages | La matrice Pages comparait `/KEEP/Main/Listen/` à `/KEEP/Main/Listen` et déclarait à tort une route perdue. | Normaliser la route racine attendue avec le slash canonique Pages. | À vérifier sur le prochain run `KEEP — Web public officiel`. | FIXED_UNVERIFIED |
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
