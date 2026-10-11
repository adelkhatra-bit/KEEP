# KEEP — Sécurité des données de production

Date : 30/09/2026  
Projet Supabase production : `rrhqsqzcplvmwxizqnla`

## Principe

Une mise à jour de code Web, OTA, TestFlight ou App Store ne doit jamais réinitialiser les données. Les profils, FREE, crédits, résultats/scores Battle, achats, playlists, événements et historiques sont des actifs persistants dans Supabase.

Le code applicatif peut évoluer. L'identité et l'historique utilisateur restent.

## Modèle de migration obligatoire

Pour une évolution de schéma :

1. **Expand** : ajouter colonne/table/index/RPC de façon compatible ;
2. **Backfill** : remplir les nouvelles données sans supprimer les anciennes ;
3. **Switch** : déployer le code qui lit/écrit le nouveau modèle ;
4. **Contract** : seulement plus tard, retirer un ancien champ après preuve qu'il n'est plus utilisé.

Les tables de crédits FREE et journaux d'audit sont traités comme des ledgers append-only : une correction ajoute un événement compensatoire ; elle ne réécrit pas l'historique.

## Interdictions production

- `supabase db reset` ;
- `supabase db push` tant que l'historique local/remote n'est pas réconcilié ;
- DROP/TRUNCATE/DELETE sur les données protégées ;
- modification d'un fichier de migration déjà committé ;
- réécriture directe des ledgers FREE/audit ;
- seed de test dans la base production.

Le CI `KEEP — Data preservation contract` bloque ces formes dans chaque push/PR.

## Contrôle avant une migration réelle

1. confirmer le project ref KEEP ;
2. vérifier qu'un mécanisme de backup/restauration adapté au niveau de production est actif ;
3. lancer `supabase/scripts/production-data-invariants.sql` en lecture seule ;
4. appliquer **une seule nouvelle migration ciblée** ;
5. relancer les invariants ;
6. vérifier Security Advisor / Performance Advisor ;
7. déployer ensuite le code applicatif.

## Échelle 2 millions d'utilisateurs

L'organisation Supabase KEEP est actuellement sur le plan Free au 30/09/2026. Ce niveau est acceptable pour le développement actuel, mais ce n'est pas la posture de sauvegarde/reprise à conserver avant un lancement à très grande échelle.

Avant montée en charge réelle : passer sur une offre adaptée avec sauvegardes automatiques et activer PITR si le RPO exige une restauration fine. Ce changement est une décision de facturation et n'est donc jamais effectué automatiquement par une IA.

Une restauration globale reste un dernier recours : elle peut elle-même supprimer les écritures arrivées après le point restauré. La première défense est donc toujours une migration additive et compatible.
