# KEEP / Loki Music — Cahier des charges maître

Version : **2026-10-08.1**
Statut : **SOURCE DE VÉRITÉ PRODUIT**  
Repository : `adelkhatra-bit/KEEP`  
Branche produit unique : `reconcile/claude-main-20260825`

Ce document est la référence fonctionnelle et visuelle à lire avant toute modification. Une nouvelle demande validée par Adel peut modifier ce cahier des charges ; dans ce cas, le code, ce fichier et les guards automatiques doivent rester cohérents.

## 0. Bibliothèque anti-régression

Ce cahier est la bibliothèque produit durable de KEEP/Loki. Une ancienne conversation, une capture, un commentaire historique ou la mémoire d'une IA ne peut jamais remplacer la règle active écrite ici.

Chaque décision UI verrouillée doit rester cohérente dans quatre couches dans le même commit : code actif, ce cahier, `config/keep-ui-baseline.json`, et guard/test CI. Une nouvelle demande explicite d'Adel peut changer la règle ; dans ce cas les quatre couches changent ensemble. Il est interdit de restaurer un ancien design uniquement pour faire passer un test obsolète.

## 1. Dépôt et environnement

- Ne jamais travailler sur `main`.
- Ne jamais créer une seconde version de l'application pour contourner un bug.
- Mobile, web public et TestFlight restent issus de la branche canonique.
- Supabase KEEP uniquement : `rrhqsqzcplvmwxizqnla.supabase.co`.
- Ne jamais mélanger KEEP/Loki avec Inside Dombe.
- Ne pas modifier `packages/mobile/App.tsx`, `packages/mobile/src/navigation/Navigation.tsx`, la barre des 5 onglets, `.env`, `.p8` ou `eas.json` pour un correctif local sauf demande explicite.

## 2. Crédits — règle immuable

- listen = 0
- recognize = 0
- PASS = 0
- KEEP = -3

Une refonte UI n'a jamais le droit de modifier ces valeurs.

## 3. Navigation principale

Ordre des 5 onglets :
1. Loki Music
2. Découvertes
3. Playlists
4. Soirées
5. Profil

Ils restent visibles et utilisables sur téléphone et navigateur. Aucun flux critique ne doit exiger un swipe caché.

## 4. Responsive

Tailles de contrôle minimales : 390×844, 430×932, 768×700, 900×700, 1440×900.

- Réduire puis agrandir la fenêtre ne doit jamais produire un écran noir.
- Ouvrir/fermer les DevTools ne doit pas changer la disponibilité des écrans.
- `html`, `body` et `#root` gardent une hauteur viewport valide.
- Les 5 onglets restent visibles.
- Aucun débordement horizontal critique.
- Les mises à jour Web/OTA sont automatiques et silencieuses : aucun bandeau, bouton « Actualiser / Mettre à jour » ou carte de version n'est montré à l'utilisateur.
- Un reload automatique attend obligatoirement la fin du bootstrap Auth Supabase ; il ne peut jamais partir pendant la restauration de session.
- La restauration de session concurrente est dédupliquée : `getCurrentSession()` et `onAuthStateChange()` ne doivent pas hydrater deux fois le même compte en parallèle.
- Le premier écran authentifié apparaît dès que le vrai profil Supabase est hydraté ; synchronisation historique, verrous de crédits, push et autres tâches secondaires ne bloquent pas ce premier rendu.

## 5. Écouter

Source : `HomeScreenCompact.tsx`.

- démarrer le micro ;
- animation visible pendant l'écoute ;
- Arrêter/Terminer coupe immédiatement `Audio.Recording` ;
- ressource micro libérée ;
- retour état inactif ;
- PASSER, GARDER, ARRÊTER et morceau courant accessibles sans swipe obligatoire.
- L'accueil Écouter affiche Loki Pulse directement avec les bulles musicales de l'utilisateur ; le bloc « Loki Music DNA » n'y apparaît plus.
- Le bloc Loki Pulse d'accueil ne redirige pas vers le profil : les bulles sont visibles directement sur place, tout en conservant Loki Pulse sur le profil.
- Décision du 08/10/2026, issue #50 : carte détectée → **Pas la bonne** ; feuille du bas avec jusqu'à trois autres correspondances réellement fournies par le moteur (aucun résultat inventé), puis recherche catalogue par choix d'artiste/style, sans clavier. Le choix remplace la carte et son entrée de session ; aucun signal de goût/redécouverte pour le titre refusé. Les propositions non confirmées ne préremplissent pas les goûts.
- Chaque refus et son choix éventuel sont journalisés dans `keep_recognition_corrections`, auteur uniquement et lecture admin ; aucune écriture en Mode Démo. GARDER reste sur la fiche du titre.
- **SESSION**, à côté de Couper le micro, attend la libération réelle du micro puis ouvre le récapitulatif existant ; revenir ne relance jamais l'écoute.
- Pendant l'écoute : bandeau fixe **Écoute active + ⓘ**, pastille voix sur fond plein clair au-dessus de l'animation, bulle robot entièrement dans la fenêtre. Le bandeau animé de l'accueil au repos reste inchangé.

## 6. Découvertes

Source : `DiscoverScreen.tsx`.

- carte compacte ;
- GPS affine mais ne bloque pas la découverte ;
- profil visité = `PublicUserProfileScreen.tsx` ;
- visite d'un utilisateur connecté peut notifier le propriétaire via la logique serveur existante.

## 7. Playlists / Ma musique

Source : `MyMusicScreen.tsx`.

- une seule bibliothèque ;
- un seul moteur de classement ;
- une seule logique Collections ;
- aucun second workspace caché de vente/collection ;
- Pépites sépare visuellement les collections **FREE** et **€ EUROS** ;
- création d'une collection = parcours visible en 3 étapes : morceaux → mode/prix → publication ;
- un morceau déjà présent dans une collection publiée est signalé **DÉJÀ PUBLIÉE** et ne peut pas être ajouté une seconde fois ;
- en euros, le lien de paiement personnel (ex. PayPal.Me) se configure directement dans ce parcours, sans route morte ni écran caché ;
- en FREE, aucun lien de paiement externe n'est demandé.

## 8. Soirées / Battle

Source : `PartiesScreen.tsx`.

- Battle ouvre directement le vrai Battle ;
- accueil Battle : deux choix courts **SOLO | EN LIGNE** ; ne pas répéter « BATTLE » sur le second bouton ;
- un Solo quotidien n'est consommé qu'au premier extrait audio réellement lancé, jamais à la simple préparation du pack ;
- après ce premier démarrage, quitter en cours de partie conserve le Solo comme consommé ;
- la consommation du quota Solo est idempotente : retry réseau/double effet React = une seule partie ;
- Décision du 08/10/2026, issue #50 : position de départ des extraits **12 s**, configurable `battle_preview_start_sec` (0–20 s) dans le Super Admin ; ce n'est pas un délai avant lecture. Synchronisation/fallback ajoutent cette position à l'horloge du serveur.
- **Pas de voix** annule le tour sans point ni perte de FREE ; le tour annulé ne pénalise pas le score Solo. `keep_battle_excluded_tracks.reports` reçoit les signalements ; à deux, le titre est exclu des tirages. Le Mode Démo ne signale rien en base.
- classement Battle séparé/repliable ;
- événements, RSVP, participants, playlist et lobby restent dans la même architecture.

Catalogue Battle/Solo :
- le catalogue grandit côté serveur, sans nouvelle version App Store ;
- le tirage privilégie les morceaux et artistes non vus récemment (mémoire bornée : 120 morceaux / 240 artistes par profil), puis seulement le fallback du thème ;
- **Chanson française** est un catalogue profond multi-générations avec budget de 4 000 titres par passe et au moins 120 artistes nommés au bootstrap, dont Gilbert Montagné ;
- l'alimentation est automatisée dans Supabase Cron/Vault par petits lots afin de respecter le fournisseur et de ne jamais gonfler le bundle mobile.

## 9. Profil propriétaire — disposition verrouillée

Source : `ProfilePublicScreen.tsx`.

Zone identité :
1. avatar ;
2. pseudo + certification ;
3. type Fan / Créateur / DJ / Artiste / Producteur / Lieu ;
4. Battle dans la même zone identité ;
5. ville / pays dessous.

Barre suivante verrouillée : **PLUS | Abonnés | Reprises | FREE**.
**FREE est immédiatement à droite de Reprises**, dans la même barre et sur le même axe. Il apparaît exactement une fois et jamais à côté du type de profil.

Bas du profil propriétaire :
- **Mes réseaux** ;
- **Loki Pulse** juste dessous ;
- **Partager mon profil** immédiatement après Loki Pulse.

Interdictions :
- FREE apparaît exactement une fois, immédiatement après Reprises ;
- une correction UI ne doit jamais écrire ou réinitialiser la certification ou le solde FREE en production ;
- certification = donnée réelle Supabase `profiles.certification_tier` ;
- solde FREE = donnée réelle issue des RPC de crédit existantes ;
- ne pas remettre FREE à côté du type de profil ;
- le nombre FREE principal reste uniquement dans la barre `PLUS | Abonnés | Reprises | FREE` ;
- la zone identité reste `type de profil | Battle` ;
- quand l’utilisateur ouvre le détail FREE, **ne pas répéter “FREE disponibles”** : la première statistique est **FREE dépensés aujourd’hui** pour les vrais GARDER débités ;
- cette dépense quotidienne vient du journal serveur `keep_free_spend_events` / RPC `keep_free_spent_today`, avec le montant réellement débité au moment de l’action ; ne jamais la recalculer avec le prix actuel ;
- une reprise sociale à 0 FREE ne compte jamais comme dépense ;
- la journée FREE suit le cycle produit 02:00 → 01:59 dans le fuseau local de l’appareil.

## 10. Hamburger profil

Le hamburger donne accès aux fonctions profil, communauté, musique et aide.

- La rubrique est **Réseaux & site web** : elle gère les réseaux et le site, pas la visibilité globale.
- Le réglage global **Profil visible / privé** est placé tout en haut du centre Notifications.
- Il ne contient pas de second chemin Compte / connexion / déconnexion. La session est gérée dans `ProfileSettingsMobileScreen.tsx`.

## 11. Profil persistant

Sources : `ProfileSettingsMobileScreen.tsx`, `profileService.ts`, Storage.

Doivent survivre au reload :
- pseudo ;
- bio ;
- avatar ;
- ville ;
- pays ;
- date de naissance ;
- genre ;
- réseaux sociaux ;
- site web.

## 12. Localisation

- bouton « Utiliser ma position » ;
- GPS ;
- préremplissage ville + pays ;
- modification manuelle ensuite ;
- aucune coordonnée GPS précise affichée publiquement.

## 13. Réseaux sociaux

Instagram, TikTok, Snapchat, YouTube, X, Facebook.

- lien présent → ouverture directe ;
- lien absent → message « Cette personne ne partage pas ce réseau » ;
- persistance serveur pour un compte réel.

## 14. Retours / réglages

- Retour revient au contexte attendu ;
- Playlists revient réellement à l'onglet Playlists ;
- aucune déconnexion nécessaire pour sortir d'un écran ;
- pas de doublon de réglage.

## 15. Onboarding

Le mini-tour reste attaché au vrai écran Loki Music et ne doit jamais créer une page noire séparée.

## 16. Profil visité

Source : `PublicUserProfileScreen.tsx`.

- même langage visuel que le profil propriétaire ;
- jamais de contenu privé/payant exposé ;
- données Battle/suivi/reprises réelles ;
- premier découvreur conservé.

## 17. Données et mises à jour

Durable = Supabase, pas un state React isolé. Réutiliser les tables/services existants avant de créer quoi que ce soit.

- Une mise à jour Web, OTA, TestFlight ou App Store ne réinitialise jamais les données utilisateur.
- FREE, crédits, achats, scores/résultats Battle, profils, playlists et historiques sont des actifs persistants.
- Les ledgers FREE/audit sont append-only : une correction ajoute un événement compensatoire, elle ne réécrit pas l'historique.
- Les changements de schéma suivent Expand → Backfill → Switch → Contract et restent compatibles avec les anciennes données.
- `supabase db reset` et `supabase db push` sont interdits contre la production tant que le drift local/remote n'est pas réconcilié.
- Le CI `KEEP — Data preservation contract` doit bloquer toute opération destructive sur les tables protégées.
- Avant une montée en charge réelle, la production doit disposer de sauvegardes et d'un RPO/RTO adaptés ; PITR est à activer si le besoin de restauration fine l'exige.

## 18. Super Admin

Source : `packages/admin`.

- pas de second admin ;
- Remote Config UTF-8 ;
- secrets serveur ;
- feature flags/intégrations dans les briques existantes.

### Versions et preuves — IDEA-189, validé le 06/10/2026
- Vue dans `/home/runner/work/KEEP/KEEP/packages/admin/pages/operations.tsx` uniquement : version.json canonique réellement observé, dernière app native signalée (jamais un état d’installation global), compteurs exacts serveur ou erreur explicite. Liste de correctifs bornée à 100, pas de zéro de repli.
- `/home/runner/work/KEEP/KEEP/packages/admin/pages/problem-reports.tsx` conserve triage et réouverture ; « Corrigé » exige `fixed_in_sha` complet et chemin anti-régression. Un SHA/chemin est une preuve documentaire seulement : ni exécution réussie, ni livraison. Anciens signalements sans preuve conservés.
- Aucune donnée privée de signalement ni jeton dans un export public. Collecte des contrôles GitHub côté script/workflow lecture seule, branche/SHA/date/liens explicites, succès et skipped/échecs/inconnus séparés.
- Contrat existant `adminReleaseEvidence`, tests `/home/runner/work/KEEP/KEEP/scripts/admin-release-evidence.test.cjs` et `/home/runner/work/KEEP/KEEP/scripts/problem-report-evidence.test.cjs`.

### APIs publiques — toolbox agents

- Catalogue de découverte : `public-apis/public-apis` via `npm run public-api:search -- <besoin>`.
- Ce catalogue n'est jamais une dépendance runtime automatique.
- ChatGPT/Claude doivent vérifier CGU, quota, HTTPS, confidentialité et disponibilité avant toute intégration.
- Une clé API reste côté serveur/Vault/Edge Function ; jamais dans le bundle mobile.
- Une API publique critique doit avoir timeout, gestion d'erreur et fallback.

## 19. Tests avant validation

- branche canonique ;
- contrat UI ;
- TypeScript mobile ;
- moteur musique ;
- tests ciblés ;
- rendu 390×844 ;
- rendu desktop ;
- export iOS/build natif lorsque nécessaire.

Ne jamais annoncer PASS sans preuve.

## 20. Protocole anti-régression pour toutes les IA

Avant toute modification :
1. lire ce fichier ;
2. lire `docs/KEEP_CAHIER_DES_CHARGES_UI.md` ;
3. lire `docs/CODE_GPS.md` ;
4. lire `docs/ERROR_LEDGER.md` ;
5. lire `docs/INTEGRATION_CHECKLIST.md` ;
6. vérifier le HEAD ;
7. chercher l'implémentation existante.

Après une nouvelle règle validée :
- incrémenter la version ;
- mettre à jour d'abord `config/keep-product-contract.json` (bibliothèque machine canonique) ;
- modifier la règle ici ;
- mettre à jour `config/keep-ui-baseline.json` si automatisable ;
- mettre à jour le guard/test correspondant dans le même commit ;
- ne jamais conserver deux règles contradictoires actives.

En cas de conflit entre un vieux commentaire, un vieux test, un ancien message agent et une décision plus récente d'Adel, la décision explicite la plus récente + `config/keep-product-contract.json` gagnent.

Le dernier cahier des charges validé remplace les anciennes consignes contradictoires.

## 18. Tchat — propriété musicale et revente

- Un morceau provenant d’un autre utilisateur peut être **partagé** et **écouté** dans le Tchat.
- Il ne peut jamais être revendu par ce second utilisateur contre des **FREE** ni contre de l’**argent**.
- Dans le sélecteur et le composer, les choix payants affichent un **cadenas visible** quand la revente est interdite ; le partage standard reste disponible.
- La provenance du morceau reste enregistrée et visible : premier découvreur / profil source.
- Le blocage n’est jamais seulement visuel : Supabase doit refuser toute tentative de revente non autorisée.
- Si le destinataire possède déjà le morceau, Loki ne doit créer ni vente ni débit FREE inutile.


## Messagerie mobile
- La messagerie mobile s'ouvre en plein écran, jamais dans un petit panneau flottant.
- Le clavier iOS/Android/web mobile ne doit jamais recouvrir la zone de saisie ; la safe area haute et basse reste respectée.
- Les messages utilisent la majorité de la hauteur disponible ; le compositeur reste en bas et les actions secondaires se replient/se répartissent sans écraser le champ texte.
- MESSAGES, LA PLACE, salons privés, réactions, Pépites, FREE, PayPal/QR et profils restent fonctionnels après la refonte visuelle.

## Loki Pulse — bulles musicales
- Les petites bulles Loki Pulse sont un élément permanent sur l'accueil Écouter, le profil personnel et le profil visité.
- Elles sont indépendantes de l'accordéon Loki Music DNA : replier, désactiver ou modifier DNA ne doit jamais masquer Loki Pulse.
- Sur l'accueil, Loki Pulse remplace visuellement l'ancien bloc Loki Music DNA et ne redirige pas vers le profil.
- Les genres déclarés du profil servent de repli afin qu'un compte déjà renseigné ne perde pas ses bulles après refresh ou intégration.
