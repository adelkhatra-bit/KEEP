# Scénario économique Loki Music — mode économiste / trésorier (Adel, 05/10/2026, IDEA-104)

> Statut : **PROPOSITION À VALIDER PAR ADEL**. Les chiffres réels viennent de la base (lecture seule, 05/10/2026) et de `docs/COST_AND_MARKET_STUDY.md` (hypothèses H1-H4, à remplacer par de la mesure). Tout ce qui est marqué *hypothèse* n'est pas mesuré. Ne rien afficher dans l'app ou les conditions sans validation. Complète `docs/PRICING_STRATEGY.md` (Économie FREE, brouillon communauté).

## 1. Où on en est (mesuré, 05/10/2026)
- 17 comptes, **0 nouveau en 7 jours**, 4 utilisateurs qui gardent de la musique cette semaine, 152 GARDER, 27 abonnements entre membres, **3 parrainages validés** (tous via adel4A).
- **0 € encaissé** : les 4 formules payantes sont toutes offertes par l'admin (`admin_grant`). Prix actifs : Premium 4,99 € · Creator Pro 9,99 € · Venue Pro 29,99 € /mois (annuels désactivés : 39,99 / 79 / 279 €) ; Free = 5 FREE offerts par mois. Recharges FREE prévues (30 FREE = 0,99 €, 100 = 2,49 €, 300 = 5,99 €).
- Conclusion de trésorier : aujourd'hui l'app coûte (serveur, reconnaissance musicale payante 0,36 à 0,60 €/mois par gratuit actif) et ne rapporte rien. Le problème n°1 n'est pas le prix, c'est **le nombre d'utilisateurs actifs** et **l'activation du premier paiement**.

## 2. Ce qu'est le produit (pour que chaque règle serve le business)
Un réseau social musical : on découvre, on garde, on partage sa culture musicale ; la communauté d'un membre le suit et peut suivre ses conseils (musiques, soirées, événements, lieux). **La valeur vient de la taille et de l'activité des communautés** → tout le système doit pousser (1) l'inscription, (2) le retour quotidien, (3) l'invitation d'amis, puis (4) vendre le confort et la portée.

## 3. La boucle qui fait tourner la machine
1. **Verrou à débloquer (livré, IDEA-103/104)** : le badge de classement est offert 30 jours (à l'inscription ; pour les comptes existants, 30 jours à partir du 05/10/2026), puis il faut **1 parrainage validé OU une formule payante** pour le garder. Trois chemins : *temps* (le mois offert), *social* (parrainer 1 ami), *argent* (Premium).
2. **Le classement donne la raison** : partager (+1), faire reprendre sa musique (+3), gagner un abonné (+2) → médaille/étoile sur la bulle → plus de vues → plus d'abonnés → communauté plus grande.
3. **Le parrainage est le canal d'acquisition le moins cher** : un filleul validé coûte 2 FREE, soit ~0,05 € de valeur nette (voir étude), contre ~2 à 5 € d'une installation achetée (*hypothèse marché*). Chaque ancien membre est donc poussé à amener au moins 1 ami après son mois offert.
4. **Premium = la même chose, sans devoir parrainer + du confort** (« les jeunes par le social, les adultes par l'argent ») : badge conservé sans parrainage, bonus FREE plus élevé (30/mois), statistiques de communauté (IDEA-092), quotas d'écoute plus hauts. Ne pas vendre l'avantage de classement lui-même (équité) : vendre la portée et le confort.
5. **Retour quotidien** : story 24 h avec chronomètre, robot qui salue (plafonné), défis, série quotidienne (à implémenter, +FREE).

## 4. Lignes de revenus (par ordre de priorité)
| # | Ligne | État | Net par vente (après TVA 20 % et Apple 15 %) |
|---|---|---|---|
| A | Abonnements Premium / Creator Pro / Venue Pro (Apple IAP) | produits non créés dans App Store Connect | 3,53 € · 7,08 € · ~21 € |
| B | Recharges FREE (consommables IAP) | tables prêtes, produits à créer | 0,70 € · 1,76 € · 4,24 € |
| C | Commission sur les collections vendues entre membres (PayPal/FREE) | en place côté produit, taux de commission à fixer | à décider |
| D | Lieux et événements (Venue Pro, mise en avant d'une soirée à la communauté) | Venue Pro existe ; mise en avant à créer | 21 € / lieu / mois |
| E | Sponsoring natif dans les stories (une musique/une soirée sponsorisée) | idée (IDEA-014) | à partir de ~5 000 utilisateurs actifs (*hypothèse*) |

## 5. Trois scénarios mensuels (hypothèses : conversion payants 3 / 4 / 5 % avec mix 80 % Premium, 15 % Creator, 5 % Venue ; 5 à 6 % des gratuits achètent une recharge moyenne ; coût API gratuit = 0,135 €/mois à p = 15 % ; coûts fixes 250 € / 250 € / 3 000 € — *plan Supabase et EAS réels à confirmer avec les factures*)
| Utilisateurs actifs | Payants | Revenu net abonnements | Recharges FREE | Coût API | Coûts fixes | Résultat/mois |
|---|---|---|---|---|---|---|
| 1 000 | 30 | ~147 € | ~85 € | ~131 € | 250 € | **≈ −150 €** |
| 10 000 | 400 | ~1 965 € | ~880 € | ~1 350 € | 250 € | **≈ +1 250 €** |
| 100 000 | 5 000 | ~24 565 € | ~10 000 € | ~12 800 € | 3 000 € | **≈ +18 800 €** |
**Seuil de rentabilité ≈ 2 500 à 3 000 utilisateurs actifs** dans ce modèle. Hors commissions marketplace et sponsoring (non chiffrés). Sensibilité principale : le coût de la reconnaissance payante → voir `COST_AND_MARKET_STUDY.md` §4 (mémoire Loki d'abord, plafonds par compte).

## 6. Croissance : l'équation à surveiller
Coefficient viral K = invitations envoyées par membre actif × part acceptée. Cible : **≥ 0,3** (ex. 1,5 invitation/mois × 20 % d'inscriptions validées) + acquisition locale (communautés de ville, soirées, lieux partenaires) pour le reste. Chaque membre qui passe le mois offert sans parrainer doit voir clairement ses 3 chemins (popup du cadenas).

## 7. Tableau de bord à suivre (Super Admin)
Inscriptions/semaine · activation (1er GARDER < 24 h) · rétention J1/J7/J30 · parrainages validés/membre · conversion payants · ARPU net · coût API par gratuit actif · part des écoutes en mémoire Loki (objectif ≥ 85 %).

## 8. Plan 90 jours (ordre conseillé)
1. **Rendre l'argent possible** : créer les produits App Store Connect (mensuels + annuels −33 %, recharges), Small Business Program (15 %), banque/RIB côté App Store Connect (jamais dans le dépôt), accord du comptable pour la TVA.
2. **Réduire le coût par gratuit** (étude §4 : leviers 1, 6, 4, 2, 3) avant de pousser l'acquisition.
3. **Activer le parrainage** : lien `?ref=CODE` partageable depuis le cadenas (livré), message « +2 FREE par filleul validé » (plafond 20/mois), page d'accueil web claire.
4. **Lancer 2 à 3 communautés locales** (ville, bars/lieux, étudiants) avec soirées/événements dans les stories.
5. **Mesurer 30 jours** puis ajuster prix, quotas et seuil de déblocage (régler depuis `remote_config`/Super Admin, jamais en dur).

## 9. Décisions à prendre par Adel
1. Valider la règle : mois offert → 1 parrainage ou Premium (aujourd'hui appliquée au **badge/classement uniquement**, jamais au droit de poster une story).
2. Prix Premium définitif (2,99 € ou 4,99 € ; en base : 4,99 €) et quotas d'écoute par formule.
3. Taux de commission des collections vendues.
4. Récompense concrète du concours (FREE ? mise en avant ?) et budget mensuel maximal.
5. Plan Supabase / coûts fixes réels (factures) pour remplacer les hypothèses du §5.
