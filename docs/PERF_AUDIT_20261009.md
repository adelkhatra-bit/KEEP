# Audit performance « l'application est lourde » — 09/10/2026

> TEST MODE : **mesures statiques + Chromium local hors ligne (export web réel)**. Aucune mesure sur iPhone, aucune mesure contre Supabase réel (réseau sortant bloqué dans l'environnement cloud : `supabase.co` et `github.io` répondent 403 au tunnel). **Ce rapport ne prouve donc PAS que l'app est rapide ou lente sur iPhone.** Il liste des suspects mesurables et un protocole de test réel pour un testeur.

## 1. Ce qui a été mesuré (preuves reproductibles)

Export : `npx expo export --platform web` (branche `claude/superadmin-session-forgot-password-v2`, base `reconcile/claude-main-20260825`), puis Chromium 390×844 et 1440×900, scripts dans `/tmp/perf` (non versionnés).

| Mesure | Résultat | Lecture |
|---|---|---|
| Bundle JavaScript web | **3,57 Mo** (0,93 Mo gzip), **1 seul fichier**, 1171 modules, aucun découpage | lourd au premier chargement web ; sans effet direct sur iPhone (Hermes précompilé) |
| Démarrage de l'écran QR (web, sans lien partagé) | tâche longue 340–480 ms, 13 Mo de tas, 30 nœuds DOM, 2 minuteries (30 s, 60 s) | **léger** |
| Écran profil visiteur (lien partagé), au repos | **≈ 180 `requestAnimationFrame` / s** (3 boucles d'animation à 60 i/s), 163–219 nœuds DOM, 20,7 Mo de tas, 3 minuteries | animations continues : sur le **web** elles s'exécutent sur le fil JS ; sur iPhone seules celles en `useNativeDriver: false` le feraient |
| Requêtes réseau avec Supabase injoignable | 35 requêtes en ~8 s, dont `feature_flags` **12×** contre 4× pour les autres tables | à vérifier en conditions normales : plusieurs appelants pour les mêmes drapeaux |
| Pages d'erreur | 0 erreur JavaScript | — |

**Limite importante** : sans appairage, le web n'affiche que l'écran « Connexion ordinateur » (QR seul, décision du 04/10). Les 5 onglets ne sont donc **pas atteignables** dans ce test ; la mesure « onglet par onglet » a donné la même page (profil visiteur) et n'est **pas** exploitable.

## 2. Suspects dans le code (comptés, non chronométrés)

Comptages sur `packages/mobile/src` (hors tests) : 34 `setInterval`, ≈ 130 `setTimeout`, 49 `Animated.loop`, 15 canaux temps réel, 386 `useEffect`, 27 animations `useNativeDriver: false` (fil JS) contre 58 natives.

Fichiers de plus de 2 000 lignes (un seul composant qui se re-rend en bloc) : `KeepBattleMobileGameV3.tsx` 3816, `ProfilePublicScreen.tsx` 2972, `PublicUserProfileScreen.tsx` 2806, `MusicAgoraPanel.tsx` 2686, `MyMusicScreen.tsx` 2175.

**Suspect n°1 — Solo / Battle** (`KeepBattleMobileGameV3.tsx`) :
- l.815 : `setInterval(() => setNow(Date.now()), 100)` monte **en permanence** tant que l'écran est monté → 10 re-rendus par seconde d'un composant de 3816 lignes, y compris hors manche. Déclaré dans la liste blanche du contrat (« horloge UI, aucun réseau »), donc autorisé, mais le coût de rendu n'a jamais été mesuré.
- 7 animations en `useNativeDriver: false` dans le même fichier (fil JS).
- sondages réseau : 1500 ms (spectateur), 800 ms (revanche), 3000 ms (écran Battle ouvert) ; tous déclarés et bornés par le contrat.
- Le registre contient déjà `ERR-SOLO-LATENCY-098` (préchargement audio corrigé le 05/10) : la latence du **son** est traitée, pas le coût de **rendu**.

**Suspect n°2 — chat global** : `GlobalChatDock.tsx` l.301 `setInterval(syncRoute, 750)` sur toutes les pages (lecture locale, sans réseau). Faible coût unitaire, mais permanent. Ses animations en boucle sont en pilote natif et conditionnelles : pas de preuve d'un problème.

**Suspect n°3 — écrans à animations JS** : `PlaylistSaleImmersivePreview` (4/4 en pilote JS), `ProfilePublicScreen` (2 boucles, 6 pilotes JS), `HomeScreenCompact` (7 boucles, 2 pilotes JS).

## 3. Ce qui N'est PAS prouvé
- Que l'un de ces suspects soit la cause réelle de la lourdeur ressentie sur iPhone.
- La fluidité du Solo, la connexion TestFlight, les e-mails, le Super Admin en ligne : **non testés** (réseau bloqué, pas d'iPhone).

## 4. Protocole pour le testeur réel (iPhone, build ≥ 07/10/2026)

À remplir par un **utilisateur test humain**, dans cet ordre, en notant l'heure et le résultat (OK / lent / bloqué) :
1. Ouverture à froid de l'app : temps jusqu'à l'écran Écouter utilisable (chrono).
2. Connexion pseudo + mot de passe, puis e-mail + mot de passe : temps, erreur éventuelle (copie du message exact).
3. Écouter : lancer une identification, noter durée jusqu'au résultat ou à « rien trouvé ».
4. Solo : lancer 3 manches. Noter (a) délai avant le son, (b) saccades du chrono, (c) chauffe de l'iPhone après 5 min, (d) pourcentage de batterie perdu sur 10 min.
5. Changer d'onglet 5 fois : fluidité.
6. Mot de passe oublié depuis l'app (adresse du Super Admin), réception du mail, nouveau mot de passe, puis connexion au Super Admin.
7. QR ordinateur : scanner depuis le téléphone, vérifier la demande « Connecter cet ordinateur ? », tester Approuver puis Annuler.

Pour objectiver (1)–(4), un profil Instruments (Time Profiler + Energy Log) de l'étape 4 désigne la fonction coupable en quelques minutes.

## 5. Plan proposé (à valider par Adel — aucune modification de code faite dans cet audit)
1. **Mesurer d'abord** (étape 4 ci-dessus + Instruments) avant de toucher au code.
2. Si le rendu du Solo est confirmé coupable : ne monter l'horloge de 100 ms **que pendant une manche** (arrêt hors manche), isoler l'horloge dans un petit composant pour ne plus re-rendre les 3816 lignes, passer les 7 animations restantes en pilote natif quand c'est possible.
3. Découper le bundle web (chargement différé des écrans lourds).
4. Dédupliquer les lectures de `feature_flags` (un seul appelant mis en cache).
Chaque étape : tests, 7 garde-fous, preuve mobile 390 / ordinateur 1440, et test réel du testeur avant de dire « validé ».
