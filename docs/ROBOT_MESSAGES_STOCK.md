# Stock de messages du robot — calcul sur un an (IDEA-157, 06/10/2026)

**Demande d'Adel** : « fais un calcul sur un an, combien de messages en stock pour que le robot n'ait jamais l'impression de se répéter » (Swipe, stories, Loki Pulse), avec un langage de jeunes poli (« wesh poto » / « wesh meuf »), et un ton qui monte quand l'utilisateur ne donne jamais son avis.

## 1. Consommation d'un utilisateur très actif (pire cas, hypothèses prudentes)
- 60 musiques swipées par jour, un message du robot sur ~80 % d'entre elles (demande d'avis, encouragement, merci, rappel) → **≈ 48 messages/jour**.
- Sur un an : 48 × 365 = **≈ 17 500 messages vus**.
- Utilisateur normal (15 swipes/jour) : ≈ 4 400 messages/an.

## 2. Combien de messages différents faut-il ?
- Pour qu'un même message exact revienne en moyenne **moins d'une fois par an** : stock ≥ 17 500 (pire cas). Pour qu'il revienne **rarement** (probabilité < 2 % qu'un message déjà vu soit retiré dans l'année) : stock ≈ 50 × 17 500 ≈ **900 000**.
- Contre la répétition courte, une **mémoire des 60 derniers messages** (≈ 1 jour de pire cas) empêche tout doublon rapproché.
- Contre la lassitude des *tournures* (pas seulement des phrases entières), chaque message est assemblé de 4 pièces (accroche × corps × appel × emoji) : l'utilisateur ne revoit jamais la même combinaison, et les pièces elles-mêmes sont nombreuses (12 à 24 par pièce, par type de message).

## 3. Stock réellement disponible (calculé par le code, `nudgeLibrarySize()`)
**1 064 832 messages différents** au 06/10/2026 : 9 types (demande d'avis, pendant l'écoute, zapping, merci après ❤ / 😐 / 👎, rappel d'un avis déjà donné ❤ / 😐 / 👎) × assemblage de pièces, + adresses « jeunes » (12 pour un homme, 12 pour une femme, 12 neutres), + ton « mauvaise humeur » (poli, avec smiley).
→ Couvre ≈ 60 ans de pire cas sans répétition exacte ; la mémoire des 60 derniers garantit l'absence de doublon visible.

## 4. Règles de ton (jamais d'insulte)
- Homme : « Wesh poto, Wesh frérot, Yo bro… » ; femme : « Wesh meuf, Eh ma belle, Wesh ma reine… » ; sinon neutre (« Hého, Psst… »). Une fois sur deux seulement (le robot reste naturel).
- Ton qui monte : après **3 musiques écoutées sans aucun avis**, messages du type « t'es de mauvaise humeur aujourd'hui ? 😤 », « tu boudes ou quoi ? 🙄 » — toujours gentils, avec un smiley, jamais d'insulte ni de moquerie ; la série retombe à zéro dès qu'il donne un avis.
- Le genre vient du profil (questionnaire d'inscription) ; « Autre / préfère ne pas dire » = neutre.

## 5. Reste à faire
Étendre la même bibliothèque aux messages du robot coach (solde FREE, sessions…) et aux notifications ; ajouter des variantes régionales (si Adel le souhaite) ; faire valider les adresses par Adel.
