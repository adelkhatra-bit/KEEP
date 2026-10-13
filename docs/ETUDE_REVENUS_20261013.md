# Étude revenus Loki Music — 13/10/2026 (PLAN À VALIDER, aucun prix appliqué)

> Demande d'Adel : « carte blanche pour faire des millions, modifier les prix, que tout soit modifiable depuis le Super Admin ». Règle du dépôt : plan écrit → validation d'Adel → code. Aucune écriture en production. Tous les chiffres sont des HYPOTHÈSES (base : `docs/PRICING_PROPOSAL_SIMULATION.md`).

## 1. Constat honnête
- 0 € encaissé aujourd'hui (formules payantes = cadeaux admin, achats Apple non testés réellement). Simulation « ambitieux » = +54 k€/an à 40 000 utilisateurs : les « millions » demandent ~500 000+ utilisateurs actifs ou un revenu B2B (VENUE/CREATOR). Aucun prix seul ne les crée : c'est un problème de volume + conversion.
- Tout abonnement/recharge passe par Apple/Google (commission 15-30 %), la TVA est déjà déduite dans la simulation.

## 2. Leviers classés par rapport gain / risque
1. **Coût d'écoute** : baisser la part d'écoutes passant par un moteur payant (ShazamKit, mémoire Loki) = plus gros levier de marge.
2. **B2B VENUE PRO (29 €/mois)** : bars, clubs, hôtels = ~55 % du revenu simulé avec 5 % des payants. Prospection directe, essai 14 j.
3. **Recharges FREE** (0,99 / 2,49 / 5,99 €) : achat d'impulsion au moment « plus d'écoute » ; à tester A/B.
4. **Annuel poussé** (39,99 €) : meilleure rétention, trésorerie.
5. **Ventes entre membres / Pépites** : commission aujourd'hui 0 % (`marketplace.tsx`) → décision d'Adel requise (ex. 10-15 %), non incluse dans la base.
6. **Prix locaux par pays** (USD, GBP, AED, MXN) : jamais de conversion automatique, jamais de mélange de devises.
7. **Parrainage** : plafond 20 FREE/mois déjà posé ; coût d'acquisition ≈ 0.

## 3. Prix : proposition à tester (jamais appliquée sans accord)
| Formule | Actuel proposé | Test A | Test B |
|---|---|---|---|
| PREMIUM | 4,99 € | 3,99 € | 5,99 € |
| CREATOR PRO | 9,99 € | 7,99 € | 12,99 € |
| VENUE PRO | 29 € | 24,99 € | 39,99 € |
Méthode : un prix à la fois, 2-4 semaines, mesurer conversion et résiliation, garder le meilleur revenu/utilisateur.

## 4. Super Admin « tout modifiable » — audit lecture seule
Déjà modifiable : prix mensuel/annuel (`plans.tsx`), jours d'essai, bonus FREE mensuel, quotas par formule (11 colonnes), invités/bonus d'inscription, clés `remote_config` (`remote-config.tsx`), flags, coûts (`costs.tsx`).
Manques constatés :
- **Prix limités à 18 valeurs prédéfinies** (`PRESETS.priceEur`, de 0 à 99,99 €) → ajouter saisie libre bornée (min/max validés côté serveur) ; indispensable pour les tests A/B.
- **Prix des recharges FREE** (packs 30/100/300) : non éditables dans `plans.tsx` ; ils vivent dans l'App Store (le prix réel est celui d'Apple/Google, le Super Admin ne peut que le refléter).
- **Commission ventes entre membres** : affichée mais pas réglable.
- **Prix par pays/devise** : seule l'EUR est éditée.
- Un changement ne s'applique côté Apple qu'après modification dans App Store Connect : l'écran doit le dire clairement.

## 5. Plan d'implémentation proposé (étapes courtes, tests 390 / 1440)
1. Saisie libre des prix + garde-fous min/max + journal `audit_logs` (admin).
2. Champ commission ventes + prix par devise/pays (une devise à la fois, jamais additionnée).
3. Tableau de bord revenus réel (payants hors cadeaux et hors Sandbox, déjà noté au MASTER_PLAN).
4. Expérimentations de prix (A/B simple) lues depuis `remote_config`.

## 6. Décisions que seul Adel peut prendre
Commission sur les ventes entre membres · prix PREMIUM 4,99 € ou test · accès ordinateur réservé à CREATOR PRO · inscription Small Business Program Apple · feu vert pour l'étape 1.
