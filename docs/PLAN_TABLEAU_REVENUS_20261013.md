# Plan — Tableau de bord des revenus réels (13/10/2026) — À VALIDER, aucun code financier écrit

> Règle : plan écrit → validation d'Adel → code. Audit en LECTURE SEULE sur la base réelle (aucune écriture). Ce plan **étend l'existant**, il ne le duplique pas. EUR / AED / USD ne sont jamais additionnés ; chaque pays garde sa devise.

## 1. Audit de l'existant (preuves du 13/10/2026)
| Brique | État | Constat |
|---|---|---|
| `admin_dashboard_v2` (migration `20261007050000`) | déployée en base | **Sépare déjà réel / test** (`keep_is_test_profile`), abonnés « offerts » (`source='admin_grant'`) vs payants, net par devise (brut − remboursements), consommables IAP (nombre + FREE), ventes entre membres, économie FREE. Affichée dans `pages/index.tsx` (« abonnés payants », « net EUR »). |
| `admin_finance_report` + `pages/costs.tsx` | déployée | Revenus = `transactions` `SUCCEEDED`, remboursements, coûts (`operating_costs`), 100 dernières écritures. **Pas de séparation réel/test, ni consommables, ni ventes entre membres, ni commission Apple, ni marge.** |
| Tables | lues en base | `transactions` **0**, `refunds` **0**, `operating_costs` **0**, `store_purchase_events` **0**, `keep_iap_consumable_transactions` **0** ; `subscriptions` 6 (toutes `admin_grant` : 4 ACTIVE offertes, 2 EXPIRED) ; `playlist_sale_payments` 5 (2 `EXTERNAL_LINK` FAILED 2,00 €, 1 `EXTERNAL_LINK` PENDING 1,00 €, 2 `FREE_CREDITS` COMPLETED 6 FREE) ; `keep_battle_solo_pack_purchases` 15 (FREE). |

**Conclusion** : aujourd'hui **0 € réellement encaissé** et le tableau le dit déjà correctement. Le vrai manque n'est pas l'écran, c'est (a) la **collecte** (aucun achat Apple n'a encore alimenté `transactions` / `store_purchase_events`) et (b) quatre indicateurs absents (commission Apple/TVA, marge, MRR, ventes en attente).

## 2. Écarts à combler (sans doublon)
1. **Prix réel Apple non stocké** : `keep-iap-verify` crédite les FREE d'une recharge mais `keep_iap_consumable_transactions` n'a ni montant ni devise (seulement `free_amount` + reçu brut). Les abonnements créent une `transactions` avec le **prix catalogue** (`plan_prices`), pas le prix local payé. → colonnes additives `amount`, `currency_code`, `country_code`, `commission`, remplies depuis le reçu vérifié.
2. **Commission Apple / TVA** : `transactions.store_commission_amount` et `tax_amount` existent mais ne sont jamais lues. → net perçu = brut − remboursements − commission − TVA.
3. **Statuts** : distinguer *encaissé* (`SUCCEEDED`), *en attente* (`PENDING`), *échoué* (`FAILED`), *remboursé*. Les ventes entre membres (`playlist_sale_payments`, paiement direct entre membres, `platform_fee_cents = 0` figé) sont du **volume déclaré, jamais un revenu Loki** : section séparée « Volume marché ».
4. **Revenus par activité** : abonnements (par formule) · recharges FREE · ventes entre membres (volume) · futurs billets / Pépites — chacun par pays et par devise.
5. **Marge** : revenus nets − `operating_costs` (mensuel/annuel ramené à la période). Les coûts sont vides : à saisir d'abord (page Comptabilité déjà prête).
6. **Indicateurs d'abonnement** : MRR/ARR par formule (hors offerts), nouveaux payants, résiliations, conversion FREE → payant, ARPPU — tous hors comptes test.
7. **Traçabilité** : chaque chiffre cliquable → liste des écritures sources ; export CSV par pays/devise ; journal `audit_logs` des saisies de coûts (existant).

## 3. Garanties
- **Aucune donnée historique modifiée** : migrations additives uniquement (colonnes nullables, nouvelles fonctions `admin_revenue_*` en lecture seule), aucun `update`/`delete` sur `transactions`, `subscriptions`, `playlist_sale_payments`.
- **Pays / devises** : toute agrégation `group by currency_code, country_code` ; aucun total multi-devises.
- **Réel ≠ test ≠ offert** : mêmes filtres que `admin_dashboard_v2` (`keep_is_test_profile`, `source <> 'admin_grant'`), exclusion des transactions Sandbox Apple (`environment`).
- **Pas de doublon** : on étend `admin_dashboard_v2` (cartes de l'Accueil) et `costs.tsx` (détail) ; aucune nouvelle page parallèle ; `admin_finance_report` reste compatible.
- **Responsive** : cartes en grille 1 colonne à 390 px, tableaux défilants dans leur carte à 1440 px ; test navigateur 390×844 / 1440×900.

## 4. Étapes proposées (une PR par étape, chacune testée)
1. **Collecte (lecture du réel d'abord)** : vérifier de bout en bout un achat Sandbox Apple → `store_purchase_events` + `transactions` (+ `environment`), puis ajouter les colonnes additives de prix/commission pour les recharges. *Migration additive, à appliquer seulement avec ton accord explicite.*
2. **Fonctions de lecture** `admin_revenue_summary(from,to,country)` : encaissé / en attente / échoué / remboursé / commission / TVA / net, par devise, par activité.
3. **Écran** : section « Revenus » dans `costs.tsx` (réutilise `PeriodButtons`, pays, devises) + carte « Net encaissé » et « MRR » sur l'Accueil.
4. **Marge + export CSV** et traçabilité (clic → écritures).
5. **Preuves** : tests de contrat SQL en transaction annulée, tsc, build admin, robot navigateur 390/1440, publication vérifiée.

## 5. Décisions à valider
1. Le **volume des ventes entre membres** s'affiche-t-il en section séparée « Volume marché (non revenu Loki) » ? *(recommandé)*
2. Étape 1 : puis-je tester un achat **Sandbox** Apple (donc exclu des totaux) pour valider la collecte ? Besoin d'un compte testeur ou de ton feu vert pour utiliser le compte de vérification existant.
3. Commission Apple : saisir le taux (15 % ou 30 %) dans `remote_config` si le reçu ne le fournit pas ?
4. Priorité : étape 1 (collecte) avant l'écran, ou l'écran avant ?
