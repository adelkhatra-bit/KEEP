# Loki — Politique de sécurité

## Signaler une vulnérabilité

Utiliser exclusivement **Security > Advisories > New draft security advisory**
dans ce dépôt. Ne pas ouvrir d'issue publique et ne jamais joindre de secret,
de jeton, de fichier `.env`, de journal contenant des données utilisateur ou
d'extrait audio privé.

## Branche prise en charge

La branche active est `reconcile/claude-main-20260825`. Les autres branches
servent d'archives ou de sauvegardes et ne doivent pas recevoir de correctif de
production.

## Règles obligatoires

- Les secrets restent dans GitHub Secrets, Supabase Vault, EAS ou le gestionnaire
  de secrets de l'hébergeur ; jamais dans Git.
- Les GitHub Actions externes sont épinglées sur un SHA complet et immuable.
- Le jeton `GITHUB_TOKEN` reçoit uniquement les permissions indispensables au job.
- Aucun agent ou moteur local non approuvé ne doit être lancé avec accès au dépôt,
  au dossier utilisateur ou aux fichiers `.env`.
- Toute modification de l'authentification, des paiements, des workflows, de
  Supabase ou du déploiement doit être relue par le propriétaire du dépôt.

En cas de soupçon de fuite, révoquer et recréer le secret concerné avant toute
autre opération. Supprimer simplement la valeur du dernier commit ne suffit pas.
