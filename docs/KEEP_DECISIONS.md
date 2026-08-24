# KEEP — Décisions produit validées

Créé le 24/08/2026 (demande explicite d'Adel — système de mémoire persistant
pour ne plus perdre de règles entre sessions). Ce fichier liste les
décisions VALIDÉES par Adel. **Ne pas les changer sans qu'il le redemande
explicitement.** Ajout uniquement (append-only) — une décision annulée est
marquée `[ANNULÉE le JJ/MM/AAAA]` et remplacée par une nouvelle entrée, jamais
supprimée silencieusement (garder l'historique de pourquoi ça a changé).

---

## RÈGLE OBLIGATOIRE — Animation micro toujours branchée en temps réel (24/08/2026)

Demande explicite d'Adel, formulée comme règle permanente ("c'est la dernière
fois, règle obligatoire, tu me l'intègres dans les règles") : l'animation de
session (`SessionPulse.tsx`) DOIT toujours réagir en temps réel au niveau
micro réel pendant une capture -- jamais statique, jamais une simple
respiration décorative pendant qu'un vrai son est capté. Mécanisme (déjà
câblé le 24/08/2026, à ne plus jamais casser) : `captureAudioSample(onLevel,
...)` dans `micCapture.ts` pousse un niveau 0-1 à chaque chunk web
(`onaudioprocess`) ou tick de metering natif (`isMeteringEnabled`), threadé
jusqu'à `useSessionStore.tick()` (`set({ micLevel: level })`) puis
`SessionPulse` (courbe `Math.sqrt()`, pas linéaire -- les niveaux réels
tournent autour de 0.01-0.08, un mapping linéaire est invisible à l'œil).
**Toute régression future sur ce point (callback `onLevel` désactivé,
mapping qui redevient linéaire, niveau jamais poussé) est un bug P0** à
corriger avant toute autre tâche, au même titre qu'une régression de
reconnaissance.

## Positionnement produit

- KEEP N'EST PAS un lecteur de musique, ne devient jamais Spotify/YouTube/Apple Music, ne stocke jamais l'audio commercial.
- KEEP est la couche intelligente qui relie : son entendu → reconnaissance → identité du morceau → KEEP → profil musical → Spotify/Apple Music/YouTube → propagation entre utilisateurs.
- KEEP : détecte, identifie, range, relie, synchronise les métadonnées, redirige vers les plateformes, mesure la propagation. Rien de plus.
- Spécialistes de la musique, pas une plateforme généraliste — pas de commentaires façon réseau social généraliste.

## Funnel Guest → Compte → Payant

- Guest (session Supabase anonyme réelle, jamais Mode Démo) : **3 reconnaissances gratuites**.
- Après inscription (conversion du MÊME compte, pas un nouveau) : **+3 reconnaissances**, soit **6 au total** — jamais 3+6=9.
- Après le quota Free (6) : paywall Premium (Premium/CREATOR_PRO/VENUE_PRO bypassent le quota entièrement — voir plus bas).
- **Quota RÉEL, pas des tentatives** (BUG RÉEL trouvé et corrigé le 24/08/2026 — Adel a signalé "la session affiche 0 morceaux détectés mais KEEP affiche déjà Crée ton profil") : l'ancien design comptait chaque TENTATIVE de reconnaissance (même un `no_match`), donc un guest pouvait épuiser ses "3 essais" sans jamais voir un seul morceau reconnu. Redesign en deux quotas distincts :
  - Plafond ANTI-ABUS backend (`guest_recognition_limit`/`signup_bonus_recognitions`, `remote_config`) : tentatives brutes, protection de coût pure, relevé à **20/20** (migration 0020) — ne doit plus jamais être l'obstacle en usage normal.
  - Quota MARKETING (`guest_success_limit`/`signup_bonus_successes`, **3/3**, migration 0020, exposé via `GET /api/billing/recognition-config`) : compté côté CLIENT (`successCount` dans `useUserStore.ts`, persisté, incrémenté UNIQUEMENT sur un morceau réellement nouveau — jamais un doublon déjà vu ni une tentative). C'est LUI SEUL qui pilote `guestLimitReached`/`freeLimitReached`, vérifié AVANT toute capture (voir `useSessionStore.ts`).
- Ces nombres sont configurables depuis Super Admin via `remote_config` — **jamais codés en dur** côté app ou backend. Voir migration 0012 et 0020.
- Vocabulaire : jamais "téléchargement" (aucun audio n'est téléchargé) — dire "capture"/"découverte"/"KEEP".
- Quand le quota MARKETING est atteint : **ne pas continuer à appeler un provider payant (AudD) en boucle en arrière-plan.** Le check de quota bloque désormais AVANT même la capture micro, côté client (`useSessionStore.ts`, gate ajouté le 24/08/2026) — jamais après, jamais un appel gaspillé une fois le quota de révélation déjà atteint.
- "Créer mon profil"/"Créer mon compte gratuit" doit ouvrir DIRECTEMENT le parcours de conversion (écran e-mail), jamais un écran intermédiaire où l'utilisateur doit chercher/se déconnecter d'abord (bug réel trouvé + corrigé le 24/08/2026, voir `KEEP_MASTER_CHECKLIST.md`).
- GUEST → COMPTE : la conversion doit préserver le MÊME `auth.uid()` (donc les mêmes KEEP déjà faits) — méthode Supabase sûre : `updateUser({email})` + `verifyOtp(type:'email_change')`, **jamais** `signInWithOtp`/`verifyOtp(type:'email')` sur une session anonyme existante (ce dernier flux crée un nouvel utilisateur séparé et abandonnerait les données invité — vérifié contre la doc officielle Supabase le 24/08/2026).

## UX abonnement (détaillé 24/08/2026)

- Profil : afficher UNIQUEMENT le plan réellement actif (nom + badge), jamais les 4 plans alignés comme un aperçu développeur (ça, c'est le sélecteur Mode Démo, gardé séparé, jamais montré à un vrai utilisateur).
- "Voir les offres" ouvre une vraie page/modal avec les 4 plans, prix réels depuis le backend (jamais hardcodés dans plusieurs composants).
- Tap sur un plan → fiche détaillée : prix, tagline, liste réelle des avantages inclus (jamais une fonction non construite listée comme disponible — "Bientôt" ou masquée), bouton d'action.
- Si déjà sur ce plan : afficher "Plan actuel", jamais de bouton de paiement.
- FREE n'a jamais de bouton "Payer".
- Paiement pas encore branché : le dire honnêtement ("Paiement bientôt disponible"), ne jamais simuler un paiement réussi.
- Tableau de comparaison compact entre les 4 plans, uniquement des fonctions réellement disponibles.
- Parcours de montée en gamme : FREE → PREMIUM → CREATOR_PRO → VENUE_PRO, plus le downgrade propre (jamais de perte de données personnelles, juste un verrouillage des actions au-delà du nouveau plan — déjà noté plus haut).
- Chaîne paiement complète à terme : clic → checkout → paiement → webhook → subscription → entitlements → badge profil mis à jour. Jamais juste "paiement réussi" dans le frontend seul.
- UX : cartes compactes, jamais d'énormes boutons, jamais "Aperçu badge"/"Mode Démo" visible à un utilisateur réel.

## Plans & tarifs (révisé 24/08/2026 — remplace toute grille antérieure)

Codes RÉELS réutilisés (déjà seedés en base, jamais renommés) :
- `FREE` — 0 €
- `PREMIUM` — 2,99 €/mois
- `CREATOR_PRO` — 9,99 €/mois
- `VENUE_PRO` — 29,99 €/mois

Voir `docs/PRICING_STRATEGY.md` pour le comparatif marché complet.

- Un utilisateur doit pouvoir monter FREE → PREMIUM → CREATOR_PRO → VENUE_PRO et redescendre.
- Downgrade : ne JAMAIS supprimer les données personnelles ; verrouiller seulement les actions au-delà des limites du nouveau plan.
- Upgrade UX : tap badge → modal bénéfices → prix → "Payer/S'abonner" → badge confirmé.
- Paiement réel (Stripe/IAP) explicitement PAS encore branché — sandbox uniquement, séquencé après le funnel de base. Ne déclenche aucune dépense, aucun abonnement réel tant que non explicitement demandé.
- Architecture paiement : `BillingProvider` abstrait (WEB/iOS/Android), entitlements (`canRecognize`, `recognitionQuota`, `canSyncProviders`...) indépendants du provider de paiement. Statuts : FREE/TRIAL/ACTIVE/PAST_DUE/CANCELLED/EXPIRED.
- Super Admin doit pouvoir offrir un plan gratuitement à N'IMPORTE QUEL utilisateur recherché (jamais un email codé en dur) : durée 1/3/6/12/24 mois, illimité, ou date de fin personnalisée, sans carte bancaire. Traçer qui/quand/pourquoi/source. Réutilise le système Plans/Entitlements/Subscriptions existant via `subscription_source = admin_grant / promotional` — jamais une deuxième logique parallèle type "if VIP".

## LIKE vs KEEP

- LIKE = interaction sociale ("j'aime ce morceau"). KEEP = "je récupère ce morceau dans mon univers musical." Deux actions distinctes, deux systèmes distincts (`track_likes` vs `keep_decisions`).
- KEEP depuis le profil d'un autre utilisateur ("KEEP THIS TRACK") doit enregistrer la provenance : `source_user_id`, `source_type='profile'`.

## Provenance / Discovery Graph

- Tracer les chaînes de propagation (ex. Artiste → Adel → Pierre → Marie) via `source_user_id`/`source_type`/`source_track` sur `keep_decisions`.
- "DATA FIRST, UI APRÈS" — construire le graphe de données avant un dashboard analytics dédié.

## Visibilité profil

- Chaque morceau/album/playlist supporte PUBLIC / FOLLOWERS / PRIVATE, avec bouton "Masquer" immédiat et sélection multiple.
- Masquer un morceau le retire SEULEMENT du profil public — il reste dans la bibliothèque personnelle ("Mes KEEP").
- Historique d'écoute importé (Spotify/Apple recently-played) : PRIVATE par défaut.
- Un KEEP normal (pas importé) : PUBLIC par défaut (cohérent avec le choix déjà fait d'avoir un profil public).

## Communauté musicale / promotion artiste (capturé 24/08/2026)

- Suivre un artiste sur KEEP ≠ être fan de la personne. Un utilisateur peut ne pas aimer un DJ/artiste en tant que personne mais suivre son univers musical sur KEEP quand même — le suivi porte sur le GOÛT MUSICAL/la scène, pas sur l'attachement personnel à l'artiste.
- Conséquence produit : ça aide un artiste à construire une communauté plus large que ses seuls fans déclarés — quiconque partage ce style musical général peut faire partie de sa communauté KEEP. À garder en tête pour tout ce qui touche Follow/Discover/communauté artiste (pas encore traduit en fonctionnalité concrète — capturé ici pour ne pas le perdre).
- Quand un badge de plan (`VerifiedBadge`) est tapé sur le profil, l'explication de CHAQUE prix doit être claire et donner envie (pas juste afficher un chiffre) — reprend/précise la décision "Upgrade UX" ci-dessous.

## Profil — direction visuelle (capturé 24/08/2026)

- Imaginer le profil comme Instagram, mais SANS photo — la grille est faite d'ALBUMS (jaquettes) à la place des posts photo. Le principe de grille visuelle/scroll reste, le contenu change de nature (musical, pas personnel).
- Le slogan de conversion ("Ta musique mérite son profil") doit être accompagné d'un sous-texte qui rend explicite la valeur multi-plateforme : partager ses découvertes sur toutes ses plateformes, gagner en visibilité, construire une communauté — pas juste "identifier de la musique".

## Profil — ce qui doit y rester

- Photo, pseudo, bio, followers, following, plan actif, KEEP, playlists, albums, artistes, musiques visibles.
- Compteurs compacts (pas de grosses cartes).
- FOLLOW : petit bouton en haut, jamais un gros bouton en bas.
- Jaquettes = accent couleur du profil.

## UI publique — ce qui ne doit JAMAIS apparaître

- "Mode Démo", "Supabase", "Brevo", "API", texte de debug, erreur brute en anglais, badge d'aperçu, placeholder technique.
- Toute erreur provider (Supabase Auth, AudD, etc.) doit être traduite en message KEEP humain avant affichage — jamais le texte brut anglais (voir `translateAuthError()` dans `authService.ts`).
- Les données de démo doivent rester clairement isolées du mode réel (jamais mélangées, jamais montrées comme si c'était les vraies données de l'utilisateur — voir garde `usePlaylistStore.ts`).

## Email

- Sender KEEP-brandé (pas "Supabase Auth"), sujet en français, design sombre/premium cohérent avec les couleurs de l'app.
- Mécanisme unique : code à 6 chiffres (jamais un lien ET un code en même temps).
- Aucune erreur brute Supabase (ex. rate-limit en anglais) ne doit atteindre l'utilisateur — toujours traduite.

## Sécurité — règles permanentes

- Ne jamais créer de compte au nom de l'utilisateur.
- Ne jamais afficher/répéter un secret collé dans le chat (clé API, token) — l'enregistrer silencieusement dans `.env`.
- Ne jamais utiliser `service_role` pour des routes utilisateur — Management API (PAT) pour les migrations/schéma uniquement ; RLS + fonctions `SECURITY DEFINER` pour le reste.

## Seuil de silence micro — calibré sur données réelles (24/08/2026)

`silencePeakThreshold` = `0.004` (était `0.01`, sans justification documentée
à l'origine). Recalibré sur les vraies traces d'Adel : pics observés entre
0.0066 et 0.1993 sur une même session courte -- 0.01 rejetait à tort du vrai
signal (musique plus calme à cet instant), pas du silence. Ne jamais
remonter ce seuil sans nouvelles données réelles à l'appui (traces
`/api/dev/traces`), jamais une valeur ronde choisie au hasard.

## Roadmap — pas encore construit (idées capturées, pas des décisions engagées)

- **Révélation progressive floutée** (proposée par Adel le 24/08/2026, explicitement "pas maintenant, une idée future") : ne pas couper l'écoute après le quota atteint — continuer à détecter en arrière-plan, montrer les 3 premiers morceaux débloqués + un compteur type "+7 découvertes à révéler" avec jaquettes floutées pour le reste, pour rendre l'inscription plus tentante. Nécessiterait de continuer la capture même `guestLimitReached`/`freeLimitReached` (actuellement la boucle s'arrête net) + un état "détecté mais verrouillé" distinct de `pending`/`kept`/`passed`. Pas commencé.

## Discipline de développement (demande explicite du 24/08/2026)

- AUDIT FIRST avant toute nouvelle fonction : vérifier EXISTS/FILES/DB/API/UI/TESTS/RISQUE DE RÉGRESSION avant de coder. Si ça existe déjà : réutiliser/réparer/brancher, jamais un doublon.
- Ne jamais déclarer PASS parce que le code compile — PASS = test réel exécuté et observé.
- Si une modification casse un test précédemment PASS : STOP, ne pas continuer sur de nouvelles fonctionnalités tant que la régression n'est pas trouvée et corrigée.
- Checkpoint Git avant un gros chantier si le repo est stable ; commit clair après une phase réellement PASS.
