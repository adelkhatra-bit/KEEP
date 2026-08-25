# Stratégie tarifaire KEEP

Étude initiale réalisée le 2026-08-21. **Grille RÉVISÉE le 24/08/2026** (cf.
`docs/KEEP_DECISIONS.md`) après test réel du Super Admin/badges profil :
plans renommés pour RÉUTILISER les codes déjà seedés en base
(`FREE`/`PREMIUM`/`CREATOR_PRO`/`VENUE_PRO`) plutôt que d'en inventer de
nouveaux, et prix ajustés. La grille ci-dessous reflète cette révision — la
grille "4,99 €/9,99 €/29 €" plus bas dans l'historique de ce fichier avant
cette date est OBSOLÈTE, gardée nulle part ailleurs que git blame. Toutes les
valeurs restent des **valeurs de démarrage**, saisies dans
`supabase/migrations/0007_seed_defaults.sql`, et **100% modifiables depuis le
Super Admin** une fois construit (§48) — rien n'est codé en dur côté app.

## Comparables étudiés

| Produit | Catégorie | Free | Payant |
|---|---|---|---|
| **Soundiiz** | Transfert/gestion de playlists | 200 titres/conversion, 1 sync, IA limitée | Premium $5/mois ($39/an) · Creator $9.50/mois ($75/an) |
| **TuneMyMusic** | Transfert de playlists | 500 titres | Premium $4.50/mois (ou $24 à l'année, soit $2/mois) |
| **AudD** (coût provider, pas un comparable produit) | Reconnaissance musicale | 300 requêtes | $5/1 000 requêtes |

Constat : le marché du "playlist management" se vend **$2 à $9,50/mois**. KEEP
apporte plus de valeur (reconnaissance temps réel + apprentissage + réseau
social musical + événements), ce qui justifie un positionnement Premium
légèrement au-dessus de Soundiiz tout en restant très accessible.

## Grille proposée (marché de lancement : France, EUR)

| Plan (code réel) | Mensuel | Pour qui |
|---|---|---|
| **FREE** | 0 € | Guest 3 reconnaissances, +3 après inscription (6 au total), puis palier limité |
| **PREMIUM** | 2,99 €/mois | Usage illimité, historique complet |
| **CREATOR_PRO** | 9,99 €/mois | DJ/artistes/créateurs — analytics, propagation |
| **VENUE_PRO** | 29,99 €/mois | Clubs/bars/hôtels — analytics de fréquentation |

Codes plans RÉELS (base + Super Admin) : `FREE`, `PREMIUM`, `CREATOR_PRO`,
`VENUE_PRO` — jamais renommés, réutilisés tels quels (cf. décision du
24/08/2026 : ne pas créer de nouveaux codes alors que ceux-ci existaient déjà
seedés). Annuel/essais/paliers détaillés restent À DÉFINIR (non
re-confirmés depuis la révision) — ne pas supposer les anciens chiffres
annuels/essais ci-dessus toujours valables sans revalidation.

### Logique de conversion Free → payant

Le quota FREE (150 GARDER/mois) est calibré pour laisser un utilisateur actif
(2-5 GARDER/jour) largement dans les clous la plupart des mois, tout en
créant une limite naturelle pour l'auditeur intensif ou l'utilisateur
multi-provider — cas où PREMIUM devient pertinent. Les comparaisons limitées
(3/mois) créent un point de friction sur la fonctionnalité la plus virale
(Compare nos KEEP), incitant à l'upgrade au moment où la valeur sociale est
la plus visible.

### Maîtrise des coûts

Le coût variable dominant identifié est la reconnaissance musicale (AudD,
~$5/1 000 requêtes — voir `docs/MUSIC_RECOGNITION_PROVIDERS.md`). Le quota
FREE plafonne ce coût par utilisateur gratuit ; ce plafond est ajustable
depuis Super Admin sans déploiement (`usage_limits.limit_key =
'keeps_per_month'`).

## Ce qui reste à faire avant un lancement commercial réel

- Ajouter les prix USD/GBP/AED une fois ces pays activés (§48) — ne jamais
  déduire un prix par conversion automatique de devise sans validation
  humaine (risque de prix incohérents localement).
- Valider les taux de commission Apple/Google réels (généralement 15-30 %
  selon le programme et l'ancienneté du compte développeur) pour affiner la
  marge nette affichée en Super Admin (§50).
- Chiffrer un devis ACRCloud réel avant d'envisager un changement de
  provider de reconnaissance à volume.

## Sources

- [Soundiiz — Pricing & Plans](https://soundiiz.com/pricing)
- [Tune My Music — Help / pricing](https://www.tunemymusic.com/help)
- [AudD pricing](https://audd.io/resources/articles/music-recognition-api-pricing.html)
