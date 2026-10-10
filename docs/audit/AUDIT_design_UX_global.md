# Loki Music — Audit design & UX global + Feuille de route + Solution App Store

_Mode « utilisateur testeur ». Objectif : un humain doit comprendre chaque fonction sans chercher, et garder un titre en 1 à 2 clics maximum. Comparaison avec les grandes apps (Shazam, Spotify, TikTok, Instagram)._

Date : 23/09/2026 · Branche : `reconcile/claude-main-20260825`

---

## 1. Réponse courte aux 3 questions

1. **Est-ce qu'un humain comprend tout ?** Le cœur (écouter → garder) est clair. Mais **plusieurs fonctions ne s'expliquent pas toutes seules** (Vibes, Reprises, Battle, Smart Albums, crédits Free, boutons en icône seule). Il **manque un système de bulles d'aide / mini-tour au 1er lancement** — c'est le point n°1 à corriger.
2. **Combien de clics pour garder un titre ?** Aujourd'hui **2 clics** (GARDER → choisir Public/Privé). Les meilleures apps le font en **1 clic**. On peut passer à 1 clic sans rien supprimer.
3. **Combien de temps / qu'est-ce qu'il reste ?** Le **code de l'app est prêt pour l'App Store (75/75 vérifications automatiques passent)**. Ce qui reste n'est **pas du code** : c'est la partie Apple (compte, clés, validation). Détail et solution mains-libres en section 5.

---

## 2. Audit du parcours cœur : GARDER un titre

**Ce qui se passe aujourd'hui (écran Écouter) :**
- Le morceau est reconnu → carte avec titre, artiste, destination.
- L'utilisateur appuie sur **♡ GARDER** → une fenêtre s'ouvre → il doit choisir **« Public »** ou **« Privé »**. = **2 clics**.
- Le swipe (glisser à droite) ouvre la **même fenêtre** → donc pas plus rapide.

**Ce que font les grands :**
- **Shazam** : le titre reconnu est enregistré tout seul (0 clic), on choisit après.
- **Spotify / TikTok / Instagram** : « aimer / sauvegarder » = **1 seul clic** sur un cœur, réglages après.

**Recommandation (rien ne disparaît) :**
- **GARDER = 1 clic** : on garde directement en **Privé par défaut**, et la pastille **« Public / Privé »** qui existe déjà après coup permet de rendre public en 1 clic. La fenêtre de choix devient **optionnelle** (appui long ou petit bouton « options »), elle n'est pas supprimée.
- Résultat : 1 clic pour garder (comme les grands), 0 fonction perdue.

**Autres frictions repérées sur cet écran :**
- L'astuce « swipe facultatif » est en tout petit (9px) → beaucoup ne la verront pas.
- Quand le crédit Free est insuffisant, l'app **saute directement vers les offres** sans expliquer → à remplacer par un petit message clair d'abord.
- État « déjà dans ta playlist » : aucun bouton → l'utilisateur ne comprend pas quoi faire.

---

## 3. Audit écran par écran — ce qui n'est PAS évident

| Écran | Fonctions | Ce qui déroute un nouveau |
|---|---|---|
| **Écouter** | reconnaissance, garder/passer, préécoute, file d'attente | 2 clics pour garder ; swipe peu visible ; jargon « crédit Free » |
| **Découverte** | profils autour de toi, % d'affinité, garder/passer/ouvrir | boutons **icônes seules** (✕ ⭐ ♥) sans texte ; le **% d'affinité** n'est pas expliqué ; recherche sans indicateur de chargement |
| **Ma Musique** | Musiques / Vibes / Artistes, public/privé, vendre | mot **« Vibes »** non expliqué ; les actions (vendre, supprimer, public/privé) sont **cachées** : il faut déplier la ligne pour les voir |
| **Soirées** | créer/rejoindre une soirée, classement, playlist, Battle | onglet **Battle** disparaît sans explication si désactivé ; **500 abonnés** requis pour créer une soirée non annoncé à l'avance |
| **Profil public** | musiques, artistes, suivre, aimer, garder, boutique | garder un titre = **2 clics ici** (déplier) alors que c'est 1 clic en Découverte → **incohérent** ; titres « verrouillés » (en vente) pas expliqués |
| **Offres** | plans, crédits Free, récompenses | beaucoup de sigles à icône (🎁 🆕 👥 ⭐ 📅 ⚔️) → lisible mais dense ; si on revient d'une fonction verrouillée, on **perd le contexte** |
| **Onboarding** | mode invité auto, création compte, choix genres | ne dit **pas** ce que contient l'essai gratuit ; le choix des genres n'explique pas **à quoi ça sert** |

**Constat transversal (le plus important) :**
- **Aucun système d'aide contextuelle** (bulles, « ? », mini-tour). Le seul écran d'aide est celui du micro. L'aide légale est cachée dans les réglages.
- **Beaucoup de boutons en icône seule** et de **mots maison** (Vibes, Reprises, Battle, Smart Album) jamais définis à l'écran.
- **Actions cachées** derrière des lignes à déplier → l'utilisateur ne sait pas qu'elles existent.

---

## 4. Plan de correction (inspiré des grands) + estimation de temps

Tri par impact. Tout est **restylage / ajout**, rien n'est supprimé. Chaque refonte visuelle passe d'abord par une maquette validée (règle du projet).

| # | Correctif | Inspiré de | Effort estimé |
|---|---|---|---|
| 1 | **GARDER en 1 clic** (Privé par défaut + pastille Public déjà existante) | Spotify, TikTok | ½ journée |
| 2 | **Mini-tour au 1er lancement** + bulles « ? » sur chaque fonction | Instagram, Duolingo | 1,5 – 2 jours |
| 3 | **Textes sous les icônes** (✕ Passer, ♥ Garder, ⭐ Ouvrir…) partout | Shazam, Apple Music | ½ journée |
| 4 | **Expliquer les mots maison** (Vibes, Battle, Reprises) par une phrase + bulle | Spotify (Blend, Wrapped) | ½ journée |
| 5 | **Actions visibles** (au moins Public/Privé et Vendre non cachées) | Apple Music | ½ – 1 jour |
| 6 | **Messages d'états vides utiles** avec un bouton d'action clair | Airbnb, Spotify | ½ journée |
| 7 | **Cohérence « garder un titre »** : 1 clic partout (Découverte = Profil) | — | ½ journée |

**Total refonte UX confort : ~5 à 6 jours de travail** (je peux commencer dès ton GO, en te montrant d'abord une maquette pour les points 1 et 2).

---

## 5. Solution App Store (tu n'as pas les mains, tout par la voix)

### 5.1 Bonne nouvelle : le code est prêt
La vérification automatique de préparation App Store passe à **75/75**. Il n'y a **rien à coder** de plus côté app : build de production, envoi TestFlight automatique, paiements Apple (StoreKit), pages légales (confidentialité, CGU, remboursement 14 jours), tout est en place et testé.

### 5.2 Ce qui bloque n'est pas technique — c'est Apple
Il reste **6 éléments côté Apple** (aucun n'est du code) :
1. **Compte Apple Developer** (99 $/an) — obligatoire, au nom du titulaire.
2. **Activer ShazamKit** pour l'identifiant `com.adelkhatra.keep` (App Services).
3. **1 secret** `EXPO_TOKEN` (déclenche le build).
4. **2 numéros** : `APPLE_TEAM_ID` + `ASC_APP_ID`.
5. **1 clé App Store Connect** (3 valeurs) pour l'envoi 100 % automatique.
6. **Validation Apple** (relecture 24–48h) + un test rapide sur un vrai iPhone.

### 5.3 La solution mains-libres (recommandée)
Le point clé : **la génération de la clé App Store Connect ne se fait qu'UNE seule fois.** Une fois que je l'ai, **tout le reste part d'un simple « envoie sur l'App Store » — build, upload, métadonnées, screenshots et envoi en relecture — sans que tu touches à rien.** Je branche `fastlane deliver` + EAS Submit pour ça.

**Trois façons d'obtenir cette clé sans utiliser ta souris :**
- **Option A — tu me dictes les 3 valeurs** (Key ID, Issuer ID, et le fichier .p8). Si tu les as déjà ou qu'une personne de confiance les génère une fois, tu me les donnes et **je fais 100 % du reste, à vie.**
- **Option B — Contrôle vocal Apple** : l'iPhone et le Mac ont un mode « Contrôle vocal » qui pilote tout **à la voix, sans les mains**. Je te prépare la **liste exacte des phrases à dire**, étape par étape, pour créer le compte et la clé.
- **Option C — délégation** : ajouter une personne de confiance comme « App Manager » dans App Store Connect ; elle fait la config une fois, ensuite l'automatisation prend le relais.

### 5.4 Combien de temps jusqu'à l'App Store
- **Côté code : 0** (déjà prêt).
- **Config Apple (compte + clé)** : ~1 à 2h une seule fois (voix ou délégation).
- **Automatisation que je branche** : ~½ journée.
- **Relecture Apple** : 24 à 48h en général.
- **Donc : dès que le compte Apple + la clé existent, on peut envoyer la 1ʳᵉ version en TestFlight le jour même, et viser l'App Store sous ~3 à 5 jours** (délai Apple inclus).

---

## 6. Ce que je propose de faire tout de suite (dès ton « GO »)
1. Maquette + code du **GARDER en 1 clic** (point 1).
2. Maquette + code du **mini-tour + bulles d'aide** (point 2) — le manque n°1 pour la compréhension.
3. Brancher l'**automatisation d'envoi App Store** (`fastlane deliver` + EAS Submit) pour qu'il suffise de dire « envoie ».

Rien ne sera supprimé, tokens `colors.ts` uniquement, nom « Loki Music » partout, tests verts avant chaque push.
