# Choix du provider de reconnaissance musicale

Étude réalisée le 2026-08-21 (sources ci-dessous). KEEP reste provider-agnostic
(interface `MusicRecognitionProvider` dans `packages/music`) — ce choix peut
être changé sans réécrire l'application.

## Comparatif

| Provider | Free tier | Prix payant | Couverture | Verdict |
|---|---|---|---|---|
| **AudD** | 300 requêtes gratuites, sans CB | **$5 / 1 000 requêtes** (dégressif ~$2/1000 à volume, paliers $450/mois pour 100k, $800/mois pour 200k, $1 800/mois pour 500k) | Mondiale, API HTTP simple, iOS+Android+web | **Retenu en primaire** — prix publié, transparent, facile à démarrer en pay-as-you-go |
| **ACRCloud** | Essai gratuit 14 jours, sans CB | Tarification à l'usage ("metered"), **grille non publiée publiquement** — nécessite un devis via leur console | Mondiale, forte réputation broadcast/audio-monitoring | Retenu en **secours/fallback** (bascule si AudD indisponible ou si un devis ACRCloud s'avère plus compétitif à volume) — à chiffrer précisément avant d'en faire le choix primaire |
| **Shazam (Apple ShazamKit)** | Gratuit | Gratuit | **iOS uniquement**, pas d'API publique pour un usage cross-plateforme externe | Non retenu pour le MVP (KEEP doit fonctionner iOS + Android dès le départ) — à réévaluer comme option additionnelle iOS-only plus tard |

## Décision MVP

1. **AudD en primaire** : pricing public, pay-as-you-go sans engagement, permet
   de démarrer sans négociation commerciale. Coût maîtrisable : au tarif de
   lancement (~$5/1000), 150 GARDER/mois en Free (quota fixé dans
   `supabase/migrations/0007_seed_defaults.sql`) représente un coût direct
   maîtrisé par utilisateur gratuit.
2. **ACRCloud en fallback documenté**, à activer si AudD est en panne ou si un
   devis à volume s'avère meilleur — l'architecture (`MusicRecognitionProvider`)
   permet ce basculement sans changer le reste du code.
3. Aucune clé API n'est encore configurée dans ce repository — voir
   `docs/PROJECT_STATUS.md`, section ACTION UTILISATEUR REQUISE.

## Sources

- [AudD® Music Recognition API](https://audd.io/)
- [Music recognition API pricing: what to expect and how to choose](https://audd.io/resources/articles/music-recognition-api-pricing.html)
- [Song Recognition API Pricing: ACRCloud vs Shazam vs AudD (2026)](https://autovj.club/en/guide/song-recognition/)
- [ACRCloud — Audio Recognition Services](https://www.acrcloud.com/)
