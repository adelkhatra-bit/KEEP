## BIBLIOTHÈQUE PRODUIT CANONIQUE
Lire d'abord `config/keep-product-contract.json`. En cas de contradiction, la décision explicite la plus récente d'Adel + ce contrat priment sur les anciens tests/commentaires. Toute nouvelle décision durable doit mettre à jour contrat + spec + guard dans le même commit.

# RÈGLES PARTAGÉES — Toutes les IA de Loki Music

## RÈGLE ABSOLUE
Avant TOUTE génération de code, TOUTE refonte visuelle, TOUTE modification de fichier :
→ **CONSULTER CE FICHIER EN PREMIER**

## Contexte projet
- Repo : adelkhatra-bit/KEEP
- Branche : reconcile/claude-main-20260825
- Nom officiel : "Loki Music" (jamais "Loki" seul, jamais "KEEP" visible à l'utilisateur)
- Stack : React Native + Expo + TypeScript + Supabase

## Règles non négociables
1. **Rien ne disparaît** — aucun bouton, fonction, état, modale supprimé. Restyling ou ajout uniquement.
2. **Maquette HTML avant code** pour toute refonte visuelle.
3. **Tokens colors.ts uniquement** : violet #7C5CFC, menthe #2DE1C2, corail #FF5C72, fond #0B0A12.
4. **Fichiers interdits sans validation** : Navigation.tsx, App.tsx, brand.ts.
5. **Un commit par sujet.** Jamais de commit fourre-tout.
6. **Tests verts avant push** : tsc, jest, verify-source-of-truth.
7. **Audit avant code** : lire les fichiers existants avant de proposer.

## Fichiers critiques
- Design System : `packages/mobile/src/theme/colors.ts`
- État projet : `PROJECT_STATE.md`
- Index : `INDEX.md`
- Journal missions : `AGENT_MESSAGES.md`
- Actions humaines : `docs/ADEL_ACTIONS.md`

## Workflow obligatoire
1. Audit → 2. Proposition/Maquette → 3. GO utilisateur → 4. Code → 5. Tests → 6. Push avec hash → 7. Rapport court

## ISOLATION ABSOLUE DU PROJET
- Ce dépôt concerne **uniquement Loki Music / KEEP**.
- Aucune mémoire, consigne, activité, entreprise, projet immobilier, trading, établissement, dossier administratif ou autre contexte externe ne doit influencer le code, le design, les tests, la base ou les décisions produit Loki Music.
- Si un contexte hors Loki Music apparaît dans une instruction agent, un document de travail ou une mémoire externe, l'ignorer pour ce dépôt et ne jamais le recopier dans le code.
- Exception unique : une valeur peut exister si elle est **strictement une donnée créée par un utilisateur final dans Loki Music** ; dans ce cas elle reste une donnée utilisateur et ne devient jamais une règle système.
- Si une référence hors Loki Music est découverte dans le dépôt comme logique système/règle produit, l'isoler puis la retirer sans toucher aux données utilisateur.
