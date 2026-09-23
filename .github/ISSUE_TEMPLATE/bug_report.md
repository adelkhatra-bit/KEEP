---
name: Bug
about: Régression ou comportement cassé dans KEEP
title: "[bug] "
labels: bug
---

## Agent principal demandé

- [ ] claude
- [ ] codex
- [ ] copilot
- [ ] chatgpt (cadrage seulement)
- [ ] triage humain

## Ce qui est cassé

<!-- Ce que fait Adel, ce qu'il voit, ce qu'il attendait à la place. -->

## Où

- [ ] Mobile (iOS TestFlight)
- [ ] Mobile (Android)
- [ ] Web (`https://adelkhatra-bit.github.io/KEEP/`)
- [ ] Super Admin
- [ ] Backend / Supabase
- [ ] GitHub Actions / CI

## Périmètre autorisé

<!-- Dossiers/fichiers ou workflows que l'agent peut toucher. -->

## Fichiers / zones interdits

<!-- Exemple : App.tsx, Navigation.tsx, barre 5 onglets, secrets, prod. -->

## Preuve

<!-- Capture, lien, log, URL du run GitHub Actions, ID de job, artifact. -->

## Validation attendue

- [ ] workflow GitHub vert
- [ ] test ciblé reproduit puis corrigé
- [ ] aucune régression connue ajoutée
