# Innovations — analyse concurrentielle et fonctionnalités différenciantes

Recherche réalisée le 2026-08-21. Règle appliquée : ne jamais affirmer qu'une
fonctionnalité "n'existe nulle part au monde" sans vérification — chaque
concept ci-dessous est situé par rapport à l'existant.

## Paysage concurrentiel observé

- **Soundiiz / TuneMyMusic / FreeYourMusic / Tuneferry** : transfert et
  synchronisation de playlists entre plateformes. Aucun ne fait de la
  reconnaissance musicale temps réel ni du rangement appris par IA légère —
  ce sont des outils de migration, pas des compagnons d'écoute continue.
  → C'est l'espace où KEEP se différencie déjà nativement (GARDER +
  SmartPlaylistRouter en continu, pas une migration ponctuelle).
- **Spotify Wrapped et ses nombreuses alternatives** (Shuffl, Orphea, et
  autres "Wrapped alternatives" recensées en 2026) : résumés annuels/
  statistiques d'écoute façon carte à partager. Approche déjà répandue.
- **"Musical DNA" (musicaldna.com/.me) et "Meet Music"** : le concept d'"ADN
  musical" et de compatibilité musicale entre personnes existe déjà sous
  d'autres formes (souvent basé sur des tests de personnalité ou des
  statistiques d'écoute déclaratives).

**Conclusion honnête** : KEEP DNA n'est PAS un concept inédit dans l'absolu.
Ce qui est différenciant, c'est la **source des données** : un "ADN musical"
généralement construit sur *ce que l'utilisateur écoute* (streams) ; celui de
KEEP est construit sur *comment l'utilisateur range activement sa musique*
(décisions GARDER/PASSER + corrections du SmartPlaylistRouter) — un signal
plus intentionnel qu'un simple historique d'écoute, et qui reste 100 %
conforme aux CGU des plateformes (voir `docs/PLATFORM_COMPLIANCE.md` §1 —
ne jamais dériver un profil à partir du contenu/catalogue d'un provider).

## KEEP DNA — implémenté derrière `feature_flag: keep_dna` (désactivé par défaut)

Implémentation réelle : `packages/music/src/MusicDNA.ts`
(`computeMusicDNA`, `compareMusicDNA`), testée et exécutée avec succès
(voir `docs/PROJECT_STATUS.md`).

- Calcule genres/artistes dominants et un score de diversité (entropie de
  Shannon normalisée) **à partir des seules décisions KEEP** de
  l'utilisateur.
- `compareMusicDNA(a, b)` calcule une compatibilité par similarité cosinus
  sur les vecteurs de genres — réutilisable directement dans **Compare nos
  KEEP** (§21 du cahier des charges) pour enrichir le score de compatibilité
  déjà prévu.
- Ne s'active dans l'app que si `feature_flags.keep_dna.is_enabled_globally`
  (ou le ciblage pays/plan/pourcentage) est vrai côté Super Admin — flag
  déjà seedé à `false` dans `supabase/migrations/0007_seed_defaults.sql`.
- Reste PLANNED côté écran mobile (pas encore d'UI dédiée) — voir
  RESTE_A_FAIRE.md.

## Stratégie de "teaser" freemium (§ demandes du 21/08/2026)

Principe retenu pour Compare nos KEEP / Découverte : un utilisateur FREE voit
un **nombre limité et honnête** d'éléments (ex. 5 premiers artistes en
commun), puis un message clair d'upsell — jamais un chiffre inventé du type
"+127 artistes" tant que ce nombre n'est pas réellement calculé côté backend.
Le nombre affiché dans le message d'upsell doit toujours être le **vrai**
total moins ce qui est montré, calculé côté serveur, pas une estimation
marketing. Ce principe est documenté ici pour guider l'implémentation
Compare/Découverte (statut PLANNED — nécessite le backend Supabase réel).
