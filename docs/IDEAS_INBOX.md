# IDEAS INBOX — boîte à idées d'Adel (source unique)

**Règle pour TOUTE IA (Claude Code, ChatGPT, Codex, autre) :** quand Adel exprime une idée, une demande ou une envie qui n'existe pas encore dans le produit, l'IA l'ajoute ici **dans la même réponse**, avant de coder, avec le statut `IDÉE`. Elle ne la range jamais ailleurs (commentaire de code, message de commit, conversation). Une idée ne quitte ce fichier que par un statut final, jamais par suppression.

Pour savoir « ce qui reste à faire » : lire ce fichier, puis `docs/ERROR_LEDGER.md` (bugs) et `PROJECT_STATE.md` > Points ouverts.

Statuts : `IDÉE` (notée) → `CADRÉE` (proposition validée) → `EN COURS` → `LIVRÉE` (SHA + preuve) · `ABANDONNÉE` (décision écrite d'Adel).

| ID | Date | Idée (mots d'Adel, résumés) | Statut | Où ça en est / preuve |
|---|---|---|---|---|
| IDEA-001 | 05/10/2026 | **Stories musicales à la Instagram** : quand un utilisateur garde/partage une musique en public, ça devient une *story* au lieu d'une notification. Petites bulles à côté des photos de profil, avec un **contour qui s'allume** quand il y a une story à voir. Objectif : **désencombrer la cloche** de notifications. | EN COURS (1/4) | Seul le service de lecture existe : `packages/mobile/src/services/musicStoriesService.ts` (commit `83d84fb`, 72 h, 15 profils max, suivis + même style). **Non importé, aucun écran, aucune bulle, la cloche est inchangée.** Parties 2/4 à 4/4 à faire : rangée de bulles, lecteur de story, retrait des `NEW_PUBLIC_KEEP` de la cloche. Constat base (05/10) : 747 notifications non lues sur 909, dont 235 `NEW_PUBLIC_KEEP` (31 %) et 184 `BATTLE_INVITE`. |
| IDEA-002 | 02/10/2026 | **Musique en vente = masquée d'office** (Mes musiques). Onglet « Privé » qui liste toutes les musiques privées. Si l'utilisateur veut remettre en public une musique mise en vente, l'avertir, puis il décide. | IDÉE | Demande restée sans réponse : la session « Loki Music audit et bug connexion » s'est arrêtée sur la limite de dépense (02/10, 23:45). Aucune trace de code. |
| IDEA-003 | 05/10/2026 | Barre à 5 onglets **Écouter · Découvrir · Battle · Tchat · Profil**, vrai menu ☰ (proposition Claude n°6a). | CADRÉE | Non faite : le Battle est lié à `PartiesScreen`. Filet livré : `scripts/verify-route-inventory.cjs`. À valider écran par écran avec test iPhone réel. |
| IDEA-004 | 05/10/2026 | Missions de départ « Tes 5 premières missions » avec FREE serveur, puis animations de récompense (n°6b, 6c). | CADRÉE | Non fait. 1 profil sur 17 a terminé l'onboarding (05/10). |
| IDEA-005 | 05/10/2026 | Boutique : nom sans compteur figé, bloc « Mes achats » séparé, pas de doublons ; « Mes goûts » en 3 étapes ; règles §11 anti-« utilisateur perdu » (n°8.2 à 8.4). | CADRÉE | Non fait. |
| IDEA-006 | 05/10/2026 | Moteur « donner l'envie d'avoir envie » (n°9.3 à 9.7) : notifications actionnables, carte « Mon Loki de la semaine », série quotidienne, international + traduction du tchat, mesure PostHog. | CADRÉE | Non fait. |
| IDEA-007 | 05/10/2026 | Premium 4,99 €/mois, abonnements annuels −33 %. | EN COURS | Migration `20261005060000_premium_price_4_99` commitée, non appliquée. Annuels : aucun produit App Store Connect. |
