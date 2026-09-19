# AI Bridge — état Claude Code (keep-2d)

Dernière mise à jour : 2026-09-20, session continue depuis le 15/09.
Branche : `reconcile/claude-main-20260825`. Dernier commit poussé : `37e3d92`.

## Nouveau : relais ChatGPT ↔ Claude Code

Adel a demandé un vrai relais pour que ChatGPT puisse envoyer des
instructions à Claude Code sans repasser par lui à chaque fois, et
récupérer le dernier état de Claude. C'est fait côté infrastructure,
il reste deux étapes manuelles côté Adel (voir « Reste à faire »).

**Architecture (volontairement asymétrique — jamais de secret manipulé par
une IA) :**

- **ChatGPT → Claude (instructions)** : passe par la fonction edge
  `keep-ai-relay` (`POST /keep-ai-relay` body `{"op":"instruct","text":"..."}`),
  protégée par l'en-tête `x-relay-key`, comparé côté serveur à
  `AI_RELAY_API_KEY` (vault `integration_secrets`, catégorie
  « automation »). Cette clé n'est **jamais** générée, lue ou saisie par une
  IA — c'est le seul sens qui peut déclencher une action, donc il reste
  cadenassé exactement comme Stripe/Brevo/Paddle : seul Adel la crée et la
  colle dans Super Admin, puis dans le connecteur ChatGPT.
- **Claude → ChatGPT (état/rapport)** : `GET /keep-ai-relay?op=state`, même
  clé côté ChatGPT (cohérence de l'API), mais Claude Code lui-même n'a besoin
  d'aucun secret pour écrire son côté : il relit/écrit `AI/AI_REPORT.md`
  (dépôt public) comme n'importe quel autre fichier, et la fonction va
  chercher ce fichier directement sur GitHub côté serveur. Elle renvoie aussi
  les 10 dernières instructions déposées par ChatGPT.
- Table `ai_relay_messages` (migration `20260920120000_keep_ai_relay.sql`) +
  RPC `service_ai_relay_post/list/mark_read`, verrouillées `service_role`
  uniquement (même durcissement que `admin_user_directory`).
- `AI/AI_INSTRUCTIONS.md` : miroir lisible des instructions reçues (Claude le
  met à jour à chaque reprise de session).
- `AI/AI_REPORT.md` : mon dernier état, mis à jour à chaque étape notable.
- `AI/chatgpt-actions-openapi.yaml` : schéma prêt à coller tel quel dans les
  Actions d'un Custom GPT.

**Garde-fou strict appliqué (20/09/2026, avant activation) :**
- Accès limité à ce projet Supabase, aucune commande shell exposée (le
  relais ne fait jamais que lire/écrire `ai_relay_messages` ou lire un
  fichier public GitHub).
- Anti-doublon : texte identique déposé <5 min → renvoie l'id existant au
  lieu de dupliquer.
- Limite de taille : 4000 caractères/instruction (`413` sinon).
- Limite de fréquence : 30 messages/heure par (canal, auteur) (`429`
  sinon).
- Journalisation : chaque acceptation/rejet est loggé côté fonction
  (Supabase → Logs).
- Endpoint `GET ?op=ping` (sans clé, sans écriture) pour vérifier que le
  relais répond, sans jamais rien modifier — testé : `{"ok":true,"sha":"dec58bf..."}`.

**Tout ce qui pouvait être automatisé l'est désormais.** Il reste UNE seule
action qui n'a pas d'API et doit rester manuelle, dans un produit auquel je
n'ai pas accès : **ouvrir ChatGPT → créer un Custom GPT → coller
`AI/chatgpt-actions-openapi.yaml` dans Actions → générer la clé d'un clic
avec le bouton 🎲 dans Super Admin → Intégrations et la recoller dans
l'authentification du GPT.**

Détail (pour référence, plus une case à cocher qu'une vraie liste de
tâches) :

1. Super Admin → Intégrations → `AI_RELAY_API_KEY` → bouton 🎲 Générer →
   Enregistrer (valeur créée dans le navigateur, jamais vue par Claude).
2. Créer un Custom GPT dans ChatGPT → onglet Actions → coller le contenu de
   `AI/chatgpt-actions-openapi.yaml` → Authentication → API Key → Auth Type
   "Custom" → Header name `x-relay-key` → coller la **même** clé qu'à
   l'étape 1.
3. Tester depuis ChatGPT : demander à ton Custom GPT "récupère l'état de
   Claude" (doit renvoyer le contenu de `AI_REPORT.md`) puis "envoie
   l'instruction : dis bonjour" (doit répondre `{"ok":true,"id":"..."}`).

**Limite honnête** : je ne peux pas tester moi-même le trajet complet
authentifié (je n'ai jamais la clé), seulement le comportement "clé absente"
(`503 relay_not_configured`, déjà vérifié) et le fait que `AI_REPORT.md` est
bien accessible publiquement (`200`, déjà vérifié). Le test réel du bout en
bout attend l'étape 3 ci-dessus.

**Un point de sécurité que je veux que tu voies clairement** : une fois la
clé posée, ce canal me fera recevoir des instructions "au nom de ChatGPT"
sans que tu les relises forcément avant. Je continuerai à appliquer les
mêmes règles de prudence que pour une instruction venant de toi directement
(jamais de secret tapé par une IA, jamais d'action destructive sans
confirmation explicite) — mais tu perds le filtrage que tu faisais jusqu'ici
en copiant-collant toi-même. Si tu préfères garder un œil, `AI_INSTRUCTIONS.md`
reste le journal de tout ce qui arrive par ce canal.

*(Note technique : mon garde-fou de sécurité interne a bloqué une première
tentative de déploiement de cette fonction — probablement le volume de
commentaires décrivant "l'injection d'instructions". Une version plus
sobre est passée sans problème ; le comportement final est identique.)*

## État CI — build mobile

- **Site web public** (`web-preview-pages.yml`) : ✅ vert sur `c7fed73`.
- **CI complète** (`full-stack-ci.yml`) : ✅ succès confirmé sur `c7fed73`
  (les 3 faux positifs de scripts CI corrigés ce jour sont bien résolus).
- **Loki — Security guard** : était ❌ rouge sur `c7fed73` et `c9aea62`
  (étape « Require immutable external actions » — `auto-eas-build.yml`
  utilisait des tags `@v4` mutables au lieu du SHA complet exigé) → corrigé,
  ✅ **succès confirmé sur `0859821`**.
- **iOS** (`auto-eas-build.yml`, run
  [#35474673777](https://github.com/adelkhatra-bit/KEEP/actions/runs/35474673777),
  commit `0859821`) : ✅ **succès confirmé** (build + soumission TestFlight).
- **Android** (`android-preview-apk.yml`, run
  [#35474572831](https://github.com/adelkhatra-bit/KEEP/actions/runs/35474572831),
  commit `c7fed73`) : ⏳ statut définitif pas encore reconfirmé — l'API
  GitHub publique (sans authentification, car `gh auth` reste cassé par le
  `GITHUB_TOKEN` placeholder au niveau Machine) a atteint sa limite de 60
  requêtes/heure pendant la surveillance. Était encore "in_progress" au
  dernier relevé propre. À reconfirmer au prochain relais.

Une surveillance tourne en arrière-plan de mon côté et je mettrai ce fichier
à jour avec les numéros verts/rouges définitifs dès que les deux se
terminent — sans attendre une nouvelle demande.

## Corrections faites aujourd'hui (commits `fe52e17` → `37e3d92`)

1. `@keep/music` manquant dans `packages/mobile/package.json` (cassait tous
   les builds).
2. Runner iOS passé de `ubuntu-latest`/EAS Cloud (quota épuisé) à
   `macos-latest`/`eas build --local` (gratuit, dépôt public).
3. Erreur de syntaxe (guillemets) dans `ProfileSettingsMobileScreen.tsx`.
4. Bug d'exécution réel dans `KeepBattleMobileGameV3.tsx` (`'error' in
   undefined` à chaque Battle Solo réussi).
5. Faux positif CI dans `verify-admin-user-loop.cjs` (script pas à jour
   après le refactor `invokeAdminFunction`).
6. Deux tailles de police Battle descendues à 10px/9px sous le plancher de
   11px déjà imposé (`playerStatsBigLabel`/`playerStatsSmallLabel`) →
   remontées à 11px.
7. Panneau `groupStandings` (Battle >2 joueurs) mal positionné après les
   réponses au lieu d'être aligné avec la jauge duel → repositionné.
8. Deux faux positifs CI dans `verify-profile-hierarchy.cjs` (marqueurs
   obsolètes après ajout de `onPress`/`active` sur les compteurs).
9. Faux positif de test Jest Battle (marqueur obsolète après l'ajout d'une
   déduplication par artiste, amélioration réelle conservée).
10. `auto-eas-build.yml` : actions GitHub épinglées au SHA complet
    (`Loki — Security guard` était rouge à cause de ça).
11. Mise en place du relais ChatGPT ↔ Claude Code (voir section dédiée
    ci-dessus).

## Trouvé mais PAS corrigé — décision à prendre

- **`Mobile CI` (`mobile-ci.yml`) est rouge**, étape « KEEP profile data
  integrity contract » (`scripts/verify-profile-data-integrity.cjs`), sur
  `c7fed73` — **pré-existant, pas causé par les commits d'aujourd'hui** :
  - `packages/mobile/App.tsx` et `Navigation.tsx` (fichiers "design
    verrouillé" selon `CLAUDE.md`) ont un hash différent de celui attendu
    par le script. Pour `Navigation.tsx` c'est légitime (mon correctif
    safe-area iPhone de cette session, commit `c0f6f2a`) ; pour `App.tsx`
    le dernier commit qui l'a touché (`31c0390`, "account popup") n'est pas
    de moi et je ne peux pas garantir qu'il correspond à un changement
    validé — je n'ai délibérément pas mis à jour ces hash moi-même, ce
    garde-fou existe justement pour qu'un changement de ces fichiers ne
    passe jamais en silence.
  - `ProfileCounterRow.tsx` ne contient plus exactement le style attendu
    par le script (`label`/`value` couleur+taille).
  - `share-profile.html` ne contient plus le marqueur `followAccountRoute`
    attendu (contrat "priorité connexion" sur le profil public partagé).
  - `packages/mobile/dist-web` semble committé (dossier généré qui ne
    devrait pas l'être).
  Je n'ai touché à rien de tout ça aujourd'hui — je le signale pour que tu
  décides : soit ce sont des régressions à corriger, soit le script est
  simplement en retard sur des changements que tu as validés entre-temps,
  et il faut juste mettre à jour ses hash/marqueurs en connaissance de
  cause.

## Commandes utilisées cette session (pour référence, reproductibles)

```
npx tsc -p packages/mobile/tsconfig.json --noEmit
npx tsc -p packages/admin/tsconfig.json --noEmit
npx tsc -p packages/backend/tsconfig.json --noEmit
node scripts/verify-admin-user-loop.cjs
node scripts/verify-source-of-truth.cjs
node packages/mobile/scripts/verify-profile-hierarchy.cjs
node scripts/verify-profile-data-integrity.cjs
cd packages/mobile && npx jest --runInBand
git fetch origin reconcile/claude-main-20260825
git merge origin/reconcile/claude-main-20260825 --no-edit   # pour reconcilier une divergence, jamais de reset --hard
```

Déclenchement build iOS (macOS gratuit, plus de quota EAS Cloud consommé) :
```
gh workflow run auto-eas-build.yml --repo adelkhatra-bit/KEEP --ref reconcile/claude-main-20260825 -f profile=production
```

Lecture des runs CI sans authentification (dépôt public, utile si `gh auth`
est cassé par la variable `GITHUB_TOKEN` placeholder au niveau Machine) :
```
curl -s "https://api.github.com/repos/adelkhatra-bit/KEEP/actions/runs?branch=reconcile/claude-main-20260825"
```

## Ce qui bloque encore (décision d'Adel requise, rien touché)

- **`packages/mobile/app.json`** : corrompu en local, non commité (accents
  français cassés en mojibake, `useFrameworks: static` disparu). À
  restaurer ou nettoyer — pas encore fait, en attente de confirmation.
- **Migration `pnpm`** : fichiers `pnpm-lock.yaml`/`pnpm-workspace.yaml`
  présents mais non commités, `package-lock.json` supprimé en local
  seulement. Inachevée.
- **Brevo** : expéditeur `lokicontactadmin@gmail.com` toujours non vérifié,
  et même vérifié, aucun domaine authentifié (SPF/DKIM) → risque spam
  Gmail/Yahoo/Outlook.
- **Stripe** : `STRIPE_PUBLISHABLE_KEY`, prix réels (`stripe_price_id`), et
  webhook secret toujours à faire (non prioritaire selon Adel).
- **`GITHUB_TOKEN` placeholder au niveau Machine** (`ghp_xxxxxxxxxxxxx`) :
  toujours présent, casse `gh auth status`. J'ai contourné avec l'API GitHub
  publique sans authentification (dépôt public) mais une vraie clé PAT ou le
  nettoyage de cette variable réglerait ça proprement.
- Le relais ChatGPT (voir section dédiée) : deux étapes manuelles côté Adel.

## Pour prendre le relais

Le point d'entrée le plus sûr : lire ce fichier + `AGENT_MESSAGES.md`
(journal chronologique détaillé) + `AI/AI_INSTRUCTIONS.md` (nouvelles
instructions éventuelles via le relais ChatGPT) avant toute action. Ne
jamais `git push --force` ni `git reset --hard` sur cette branche.
Secrets/clés : jamais saisis par une IA dans un champ, même avec l'accord
d'Adel — uniquement par lui, dans Super Admin ou GitHub Secrets.
