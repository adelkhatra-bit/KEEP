# Catalogue « toujours trouver » + plateformes connectées — faisabilité (IDEA-149/150, 06/10/2026)

Objectif d'Adel : l'utilisateur doit **toujours** retrouver son morceau (« la honte » sinon), et Loki doit récupérer ce qu'il aime ailleurs (YouTube, TikTok, Spotify…). Statuts : ✅ possible et déjà là · 🟡 possible, à construire · 🔶 limité · ⛔ impossible côté plateforme. **Rien ci-dessous n'est codé** : plan à valider (`MASTER_PLAN.md`, Étape F).

## 1. « Des milliards de musiques » : la réalité
- Aucune plateforme n'a des milliards de titres : un grand catalogue = ~100 à 200 millions d'enregistrements. L'objectif réaliste et honnête est **couvrir la quasi-totalité de ce que les gens cherchent**, pas un chiffre.
- Ce qui existe déjà dans Loki ✅ : mémoire d'empreintes Loki (gratuite) → ShazamKit → ACRCloud → sources sans clé (iTunes, Deezer) ; imports Spotify / Deezer (OAuth directe) et YouTube Music / SoundCloud (passerelle Pipedream) ; réception de liens TikTok / Instagram / Snapchat / YouTube par « Partager → Loki » (`SharedMusicHandoff`).
- **Recherche en cascade avec repli** 🟡 : 1) catalogue Loki (table `tracks`, clé ISRC) → 2) iTunes → 3) Deezer → 4) Apple Music API (jeton développeur, déjà dans le compte Apple) → 5) Spotify recherche (clés applicatives ; **extraits souvent absents** depuis fin 2024) → 6) MusicBrainz (métadonnées). Dédoublonnage par ISRC, puis (titre + artiste normalisés).
- **Le catalogue grandit seul** 🟡 : chaque titre résolu est enregistré (ISRC, jaquette, extrait, plateformes) ⇒ le suivant le trouve instantanément et gratuitement. C'est aussi le levier n°1 de coût (voir `PRICING_PROPOSAL_SIMULATION.md`) et de **vitesse du Swipe** (extraits déjà connus, préchargement de 2 titres d'avance).
- **Filet de sécurité « introuvable »** 🟡 : bouton « Ajouter par lien » (Spotify / YouTube / Apple / Deezer / TikTok) + « Demander ce titre » (file traitée par l'agent) ; jamais une page vide.

## 2. Remonter ce que l'utilisateur aime ailleurs
| Plateforme | « J'aime » / bibliothèque | Écoute en cours | Jaquette / extrait | Verdict |
|---|---|---|---|---|
| Spotify | ✅ titres likés (`user-library-read`) | 🟡 « en cours de lecture » / récents (`user-read-currently-playing`, `user-read-recently-played`), par interrogation régulière | jaquette ✅ ; extrait 🔶 (souvent absent) | **Possible** (déjà branché pour l'import) |
| Deezer | ✅ favoris | 🔶 historique | jaquette ✅, extrait 30 s ✅ | **Possible** |
| Apple Music | ✅ bibliothèque / récents (MusicKit, sur l'appareil) | 🟡 lecture système | ✅ | **Possible** |
| YouTube / YouTube Music | 🟡 vidéos likées (YouTube Data API, `myRating=like`, OAuth lecture) | ⛔ pas d'API « en cours de lecture » | vignette de la **vidéo** (pas la pochette d'album) ; résolution titre → catalogue 🟡 (les chaînes « Topic » ont un titre propre) | **Possible pour les likes** ; écoute en direct impossible |
| SoundCloud | 🔶 likes (accès API restreint aux nouvelles applications) | ⛔ | ✅ | **Limité** |
| TikTok | ⛔ aucune API publique des « j'aime » d'un utilisateur (seulement ses propres vidéos) | ⛔ | — | **Impossible** côté API ; **Partager → Loki** ✅ (déjà là) |
| Instagram / Snapchat | ⛔ | ⛔ | — | **Impossible** ; Partager → Loki ✅ |

## 3. « Trouver un morceau pendant que j'écoute YouTube / TikTok sur le même téléphone »
- **iPhone** ⛔ : iOS interdit à une application de capter le son interne d'une autre. Possible : micro (ShazamKit / ACRCloud, ✅ déjà là) et **Partager → Loki** (✅ déjà là) ; 🟡 à ajouter : raccourci iOS (Siri Shortcut) « Identifier avec Loki ».
- **Android** 🔶 : la capture du son interne (Android 10+, service au premier plan + autorisation d'enregistrement) fonctionne seulement si l'autre application l'autorise ; à étudier après le build Android (FCM requis de toute façon).
- Conclusion : la voie fiable pour tous = **Partager → Loki** + micro. Une bulle flottante d'identification est possible sur Android, pas sur iPhone.

## 4. Super Admin : budget et frais (IDEA-151)
- Existant ✅ : page `costs` + table `operating_costs` (multi-devises, par pays) ; la fiche d'audit du 06/10 la montre **vide** ⇒ le budget n'est pas encore calculable.
- 🟡 À faire : (1) pré-remplir les coûts fixes estimés (base, e-mails, builds, compte Apple…) et le coût par requête de reconnaissance ; (2) calculer « budget mensuel conseillé » = coûts fixes + coût API par utilisateur actif × utilisateurs prévus ; (3) paramètres éditables (prix des formules, quotas Solo / Battle, récompenses FREE) sans toucher au code ; (4) **jalon 15 000 abonnés** : alerte + règles à rouvrir à ce palier. Aucun prix n'est appliqué sans accord d'Adel.
