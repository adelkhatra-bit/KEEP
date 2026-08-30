# KEEP — Pack App Store Connect prêt à soumettre

Mise à jour : 28 août 2026

Ce document prépare tout ce qui peut l’être avant l’accès final Apple Developer / App Store Connect. Il ne remplace pas les champs que seul le titulaire du compte Apple peut valider.

## 1. Identité de l’app

- Nom : `KEEP`
- Bundle ID : `com.adelkhatra.keep`
- Version marketing : `1.0.0`
- Plateforme de lancement : iPhone uniquement (`supportsTablet: false`)
- Langue principale proposée : Français (France)
- Catégorie principale proposée : Musique
- Catégorie secondaire proposée : Réseaux sociaux
- Made for Kids : NON
- EULA : contrat standard Apple, sauf décision juridique contraire avant soumission
- Content Rights : déclarer honnêtement l’accès à des contenus/métadonnées tiers et confirmer les droits/licences autorisant l’usage des catalogues et services intégrés.

## 2. Métadonnées françaises

### Nom

`KEEP`

### Sous-titre — 26 caractères

`Reconnais. Garde. Partage.`

### Texte promotionnel — 143 caractères

`Reconnais les morceaux autour de toi, garde ceux que tu aimes, organise tes playlists et découvre les univers musicaux des autres profils KEEP.`

### Mots-clés — 82 octets ASCII

`musique,reconnaissance,playlist,profil,decouverte,artiste,morceau,soiree,amis,keep`

### Description

KEEP transforme les morceaux que tu entends en une bibliothèque musicale personnelle et sociale.

Lance une écoute, laisse KEEP identifier la musique autour de toi, puis choisis simplement ce que tu veux GARDER ou PASSER. Les morceaux conservés construisent progressivement ton univers musical et ton KEEP DNA.

Avec KEEP, tu peux :
- reconnaître les morceaux diffusés autour de toi ;
- garder ou passer chaque titre sans interrompre ta session ;
- retrouver tes morceaux et organiser tes playlists ;
- construire ton KEEP DNA à partir de tes goûts réels ;
- découvrir les profils musicaux d’autres utilisateurs ;
- suivre des profils et partager ton univers musical ;
- ajouter tes réseaux sociaux à ton profil avec un contrôle de visibilité séparé ;
- utiliser ta position, uniquement si tu le souhaites, pour préremplir ta ville et ton pays et découvrir des contenus à proximité ;
- partager un morceau ou un lien musical vers KEEP depuis les applications compatibles.

KEEP n’est pas un service de streaming musical. Les extraits, métadonnées, pochettes et liens vers des services musicaux restent fournis par les plateformes et catalogues concernés selon leurs conditions.

Le microphone n’est utilisé que pendant une session d’écoute démarrée par l’utilisateur. La localisation est facultative. Les réglages de confidentialité et la suppression définitive du compte sont accessibles directement dans l’application.

### Nouveautés version 1.0

`Première version de KEEP : reconnaissance musicale, KEEP/PASS, playlists, KEEP DNA, profils musicaux, partage social et réglages de confidentialité.`

## 3. URLs App Store Connect

- Marketing URL : `https://adelkhatra-bit.github.io/KEEP/`
- Support URL : `https://adelkhatra-bit.github.io/KEEP/support/`
- Privacy Policy URL : `https://adelkhatra-bit.github.io/KEEP/privacy/`
- User Privacy Choices URL : `https://adelkhatra-bit.github.io/KEEP/privacy-choices/`
- Conditions d’utilisation : `https://adelkhatra-bit.github.io/KEEP/terms/`

Ces URL sont également accessibles depuis `Profil → Réglages avancés → Informations & confidentialité`.

## 4. Notes App Review prêtes à copier

KEEP is a music recognition, organization and social music profile app. It is not a music streaming service.

Microphone:
- The microphone is activated only after the user starts a listening session.
- Audio is captured in short samples for music recognition.
- The STOP action immediately unloads the active recording and releases the recording audio mode.
- Background audio mode is used only to keep a user-started listening session active when the app temporarily moves to the background. This behavior must be verified on the submitted TestFlight build before review.

Location:
- Location is optional and requested only when the user chooses “Utiliser ma position”.
- It is used to prefill city/country and for nearby discovery features.
- City and country can always be edited manually.

Account deletion:
- Profile → Réglages avancés → Supprimer définitivement mon compte.
- This is separate from Sign Out and removes the KEEP server account/data according to the privacy policy.

Privacy/legal links:
- Profile → Réglages avancés → Informations & confidentialité.

Music recognition:
- KEEP can use server-configured recognition providers and a keyless public metadata fallback.
- When enabled, Pipedream Connect displays the provider's authorization flow and stores encrypted OAuth tokens; KEEP never asks for a provider password.
- Missing recognition provider credentials do not block the application UI.

Reviewer account:
- A stable review username/password must be created before submission if App Review needs authenticated profile persistence.
- Do not provide a temporary or expiring account.

## 5. App Privacy — brouillon à reporter dans App Store Connect

Important : répondre au questionnaire App Privacy selon le comportement EXACT de la build soumise et de tous les partenaires intégrés. Ce tableau est un brouillon de travail, pas une déclaration juridique automatique.

### Tracking

- Data Used to Track You : NON, tant qu’aucun SDK publicitaire/attribution cross-app n’est ajouté.
- Third-party advertising : NON.
- Developer advertising/marketing profiling : NON dans la version actuelle.

### Données potentiellement liées à l’utilisateur

- Identifiers → User ID : OUI — compte KEEP, authentification et synchronisation.
- Identifiers → Device ID / app-generated device identifier : OUI si l’identifiant local transmis pour la limitation anti-abus est considéré comme collecte dans la build soumise.
- Contact Info → Name : OUI si le nom affiché/pseudo est déclaré dans cette catégorie par App Store Connect.
- Contact Info → Email Address : OUI uniquement si la build permet réellement de fournir/conserver une adresse e-mail optionnelle ou si le compte review/production l’utilise.
- Location → Coarse/Precise Location : OUI lorsque l’utilisateur active volontairement « Utiliser ma position ». Vérifier la précision réellement transmise au backend dans la build finale.
- User Content → Photos or Videos : OUI — avatar choisi par l’utilisateur.
- User Content → Other User Content : OUI — bio, site web, liens sociaux, playlists, contenus de profil.
- Usage Data → Product Interaction : OUI — KEEP/PASS, follows, préférences et interactions nécessaires au service.
- Purchases : à déclarer lorsque StoreKit/IAP est activé dans la build commerciale.

### Audio Data

Les échantillons micro sont utilisés de façon transitoire pour la reconnaissance. Avant de remplir le champ Apple, vérifier la politique de rétention réelle d’AudD/ACRCloud et la définition Apple de « collect ». Si un partenaire conserve l’audio au-delà du traitement immédiat, déclarer Audio Data conformément à la réalité.

### Diagnostics

Ne pas déclarer de Crash Data / Performance Data tant qu’aucun SDK ou service ne les collecte réellement. Si un outil de crash/analytics est ajouté avant soumission, mettre à jour ce questionnaire ET la politique de confidentialité.

### Finalités probables

Pour chaque type réellement collecté, sélectionner uniquement les finalités applicables, principalement :
- App Functionality
- Analytics uniquement si un vrai système d’analytics est ajouté
- Developer’s Advertising or Marketing : NON dans la version actuelle
- Third-Party Advertising : NON

## 6. Privacy manifest / Required Reason APIs

Apple exige que les usages des Required Reason APIs soient correctement décrits dans les PrivacyInfo.xcprivacy de l’app ou des SDK qui les utilisent.

Avant l’archive finale :
1. exécuter un prebuild iOS propre avec la version exacte des dépendances ;
2. inspecter les `PrivacyInfo.xcprivacy` intégrés ;
3. vérifier les avertissements App Store Connect après la première archive/TestFlight ;
4. ne jamais ajouter une raison générique ou fausse uniquement pour faire disparaître un avertissement Apple ;
5. corriger la dépendance ou le manifeste du bundle réellement responsable.

## 7. Permissions iOS attendues

Présentes dans `packages/mobile/app.json` :
- `NSMicrophoneUsageDescription`
- `NSLocationWhenInUseUsageDescription`
- permission photo via plugin expo-image-picker
- `ITSAppUsesNonExemptEncryption = false`
- `UIBackgroundModes = [audio]`

Supprimé volontairement :
- `NSLocalNetworkUsageDescription` — aucune fonction KEEP actuelle ne justifie une demande réseau local.

## 8. Suppression de compte

Chemin de review :
`Profil → Réglages avancés → Supprimer définitivement mon compte`

Le bouton :
- est distinct de Déconnexion ;
- demande une confirmation destructive ;
- appelle le service serveur `delete-account` ;
- supprime l’identité locale après succès.

À revalider sur le compte App Review avant envoi.

## 9. Captures App Store — plan iPhone 6,9 pouces

Préparer 6 captures portrait sans transparence, à partir de la vraie build iOS/TestFlight. Une seule série haute résolution 6,9 pouces peut servir de série principale lorsque l’interface est identique sur les tailles plus petites.

Tailles Apple acceptées pour 6,9 pouces au moment de ce document :
- 1260 × 2736
- 1290 × 2796
- 1320 × 2868

Ordre proposé :
1. ÉCOUTER — micro actif + animation visible, sans popup d’erreur.
2. DÉCOUVERTES — recherche/profils autour de soi.
3. PLAYLISTS — bibliothèque et morceaux gardés.
4. SOIRÉES — écran de découverte événementielle.
5. PROFIL — avatar, réseaux, KEEP total, KEEP utilisateurs, KEEP DNA.
6. MODIFIER / CONFIDENTIALITÉ — profil, localisation et réglages avancés.

Règles :
- pas de prix ou promesses invérifiables dans les captures ;
- pas de données privées réelles ;
- métadonnées visuelles adaptées à tous publics ;
- captures faites avec la build soumise, pas une maquette qui montre des fonctions absentes.

## 10. Age Rating — questionnaire à remplir honnêtement

Ne pas forcer manuellement une note basse. Le questionnaire Apple 2026 inclut notamment les capacités sociales.

Pour KEEP, vérifier au minimum :
- User-generated content : OUI (profils, bio, liens, playlists selon disponibilité publique).
- Messaging/Chat : NON si aucun chat direct n’est présent dans la build soumise.
- Social media capabilities : OUI.
- Unrestricted Web Access : NON si KEEP ouvre uniquement des liens externes dans le navigateur système et n’intègre pas de navigateur web généraliste.
- Gambling : NON.
- Contests : selon fonctions réellement actives à la soumission.
- Advertising : NON dans la version actuelle.
- Age assurance : répondre selon la logique de date de naissance réellement active dans la build.

L’âge final est calculé par Apple à partir de ces réponses et peut varier selon la région/OS.

## 11. App Review Information

À remplir dans App Store Connect :
- Contact Name : titulaire/responsable réel du compte développeur.
- Contact Email : adresse support réelle surveillée.
- Contact Phone : numéro réel en format international avec `+` et indicatif pays.
- Sign-in required : OUI si les fonctions examinées nécessitent un compte permanent.
- Username / Password : compte de review stable, non expirant, créé juste avant soumission.
- Notes : utiliser le bloc de la section 4.

Ne jamais mettre les secrets API, le mot de passe Super Admin ou une clé App Store Connect dans les notes de review.

## 12. Éléments externes encore requis avant le premier build iOS réel

- Compte Apple Developer actif.
- Compte Pipedream Connect KEEP configuré en production uniquement si la passerelle OAuth est activée dans la build soumise.
- Application créée dans App Store Connect avec Bundle ID `com.adelkhatra.keep`.
- Apple Team ID réel.
- App Store Connect numeric App ID (`ascAppId`).
- `EXPO_TOKEN` dans les GitHub Actions secrets.
- Clé App Store Connect (`.p8`, Key ID, Issuer ID) ou credentials équivalents déjà gérés dans EAS.
- App Review contact réel.
- Statut Digital Services Act / trader renseigné dans App Store Connect pour les territoires concernés.
- Questionnaire Content Rights.
- Questionnaire Age Rating.
- App Privacy rempli selon la build finale.
- Paiements / produits StoreKit uniquement lorsque la partie commerciale est activée.

## 13. Test final obligatoire avant “Submit for Review”

Sur vraie build iOS/TestFlight :
1. Installation propre.
2. Création/connexion d’un compte réel.
3. Écouter → permission micro → détection → Arrêter.
4. Mettre KEEP en arrière-plan pendant une session et vérifier le comportement conforme à la déclaration `audio`.
5. Partager un lien compatible vers KEEP.
6. Découvertes → GPS autorisé/refusé → saisie manuelle.
7. Playlists → persistance après fermeture forcée/reconnexion.
8. Soirées.
9. Profil → Modifier → avatar → ville/pays → date → réseaux → enregistrer.
10. Réglages avancés → politique de confidentialité → support → retour.
11. Vérifier le bouton Playlists et le retour sans déconnexion.
12. Supprimer un compte de test de bout en bout.
13. Notifications sur deux appareils réels si elles sont incluses dans la build soumise.
14. Restaurer les achats et valider StoreKit uniquement quand les IAP sont activés.
15. Capturer les screenshots App Store depuis cette build validée.

Aucune case physique/TestFlight ne doit être déclarée PASS avant exécution réelle.
