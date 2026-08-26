## KEEP — contrôle anti-régression

- [ ] J’ai lu `CLAUDE.md`, `AGENTS.md` et `.github/copilot-instructions.md`.
- [ ] Le changement vient de `reconcile/claude-main-20260825` et ne recrée aucune deuxième version de KEEP.
- [ ] Aucun lien public `localhost`, `/KEEP/KEEP`, preview temporaire ou domaine parallèle n’a été introduit.
- [ ] Les anciens endpoints `keep-public`, `keep-preview`, `keep-admin-preview` restent des redirections 308 vers GitHub Pages.
- [ ] Je n’ai pas modifié `packages/mobile/App.tsx` pour le responsive, `Navigation.tsx`, la barre des 5 onglets ou le design validé sans demande explicite.
- [ ] `node scripts/verify-source-of-truth.cjs` passe.
- [ ] Les workspaces touchés passent le typecheck.
- [ ] Si mobile/web est touché : export réel + navigateur réel, aucune page blanche.
- [ ] Si routage/partage est touché : lien direct + refresh + profil partagé testés.
- [ ] Aucun secret/API privé n’est présent dans le client ou dans le diff.

### Preuves

SHA testé :

CI / workflow :

Viewport(s) testé(s) :

Erreurs restantes :
