# Prix proposé par l'IA + simulation annuelle (IDEA-117 · 06/10/2026)

**Règle d'Adel** : quand une décision de prix bloque, l'IA propose elle-même un prix **chiffré**, simulé sur un an, qu'on fait ensuite évoluer avec les vraies mesures. Ce document est cette règle appliquée. Tout chiffre ci-dessous est une **HYPOTHÈSE** tant qu'il n'est pas remplacé par de la mesure (la source des coûts est `docs/COST_AND_MARKET_STUDY.md`). EUR uniquement, jamais mélangé avec une autre devise.

## 1. Prix proposés au lancement (France, EUR, TTC)

| Formule | Mensuel | Annuel | Pour qui | Net perçu / mois après TVA 20 % et commission Apple 15 % |
|---|---|---|---|---|
| FREE | 0 € | 0 € | découvrir, réagir, partager | 0 |
| **PREMIUM** | **4,99 €** | **39,99 €** | écoute plus large, historique, 3 services | 3,53 € |
| **CREATOR PRO** (« DJ & créateur ») | **9,99 €** | **79 €** | DJ / artistes : écran ordinateur par QR, événements, statistiques d'oreille et de communauté | 7,08 € |
| **VENUE PRO** | **29 €** | **279 €** | bars, clubs, hôtels | 20,54 € |

Pourquoi **4,99 € et non 2,99 €** pour PREMIUM : à 2,99 € le net est de 2,12 €, alors qu'un abonné qui utilise 30 écoutes par jour coûte 3,60 € d'API (étude de coûts) : on perd de l'argent sur nos meilleurs clients. À 4,99 € on couvre l'usage normal (8 écoutes/jour ≈ 0,60 €) avec ~3 € de marge. Quota conseillé : 15 écoutes/jour pour PREMIUM.

Pourquoi **CREATOR PRO porte l'accès ordinateur** : un DJ veut Loki sur grand écran (écoute + création de profil) ; c'est la fonction qui justifie 9,99 € et que PREMIUM n'a pas. Un utilisateur FREE ou PREMIUM garde l'ordinateur en lecture par QR scanné depuis son téléphone (règle du 04/10/2026).

## 2. Simulation sur 12 mois (croissance linéaire de 0 à N utilisateurs)

Hypothèses communes : coût d'une requête payante 0,005 € ; mix payants 70 % PREMIUM / 25 % CREATOR / 5 % VENUE ; usage payant 8 / 20 / 50 écoutes par jour ; coûts fixes 150 €/mois (base de données, e-mails, builds) + compte Apple.

| Scénario | Utilisateurs fin d'année | Conversion payante | Écoutes passant par un moteur payant | Revenu net | Coût API | Coûts fixes | **Résultat annuel** |
|---|---|---|---|---|---|---|---|
| Prudent | 3 000 | 2 % | 25 % | 1 897 € | 1 500 € | 1 889 € | **−1 492 €** |
| Base | 10 000 | 4 % | 20 % | 12 649 € | 6 127 € | 1 889 € | **+4 633 €** |
| Ambitieux | 40 000 | 6 % | 15 % | 75 893 € | 19 472 € | 1 889 € | **+54 532 €** |

Lecture honnête :
- Tant qu'on n'a pas ~5 000 utilisateurs actifs, la plateforme ne s'autofinance pas : l'objectif de la première année est la **traction**, pas le bénéfice.
- Le levier n°1 est de **faire baisser la part d'écoutes qui passent par un moteur payant** (mémoire d'empreintes Loki, cache partagé) : passer de 40 % à 15-20 % change le résultat plus que +1 point de conversion.
- Le levier n°2 est la **vente en FREE entre utilisateurs** et les **Pépites** (commission) : non incluse ci-dessus, donc c'est du bonus, pas une base.
- Le levier n°3 est **CREATOR PRO / VENUE PRO** : 30 % des payants mais ~55 % du revenu dans la simulation.

## 3. Comment on fait évoluer ces prix (boucle d'amélioration)
1. Chaque mois, relever : utilisateurs actifs, conversion réelle, requêtes payantes réelles, coût réel par requête.
2. Remplacer l'hypothèse correspondante ici, refaire la simulation, dater la ligne.
3. Si le coût réel d'une écoute dépasse 0,004 € pour un abonné au quota → baisser le quota ou monter le prix ; si la conversion dépasse 6 % → tester un palier intermédiaire.
4. Toute modification de prix = contrat `config/keep-product-contract.json` + ce document + `docs/PRICING_STRATEGY.md` dans le même commit, après accord d'Adel.

## 4. Décisions que seul Adel peut valider
- PREMIUM 4,99 € (proposé) ou 2,99 € (migration 0030) — **l'IA recommande 4,99 €**.
- Accès ordinateur complet réservé à CREATOR PRO (proposé).
- Inscription au Small Business Program Apple (15 % au lieu de 30 %) avant la première vente.
- Aucun prix n'est appliqué en production par ce document.
