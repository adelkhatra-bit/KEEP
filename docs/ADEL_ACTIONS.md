# ADEL_ACTIONS — Actions humaines (Priorité 2)

> Ce que **seul Adel** peut faire (je n'ai pas les droits/le compte). Chaque ligne = **1 action précise**,
> son **lien direct**, le **texte vocal exact** à dicter, et le **résultat attendu**.
> Ordre conseillé : de haut en bas. Aucune connaissance technique requise.

---

## 1. Débloquer le quota de build EAS iOS (épuisé)
- **Action** : passer l'offre EAS en « Starter » (ou supérieure) pour relancer les builds iOS.
- **Lien direct** : https://expo.dev/accounts/[ton-compte]/settings/billing
- **Texte vocal à dicter** : « Ouvre expo point dev, réglages, facturation, et choisis l'offre Starter pour les builds iOS. »
- **Résultat attendu** : quota de builds iOS rétabli → `auto-eas-build.yml` peut reproduire un build.

## 2. Donner à l'App GitHub abacusai les permissions Workflows + Actions
- **Action** : autoriser le connecteur à pousser et déclencher les workflows (nécessaire pour la soumission App Store 100% autonome et les correctifs e2e).
- **Lien direct** : https://github.com/apps/abacusai/installations/select_target
- **Texte vocal à dicter** : « Autorise l'application Abacus AI à écrire les workflows et les actions sur le dépôt KEEP. »
- **Résultat attendu** : je peux pousser `.github/workflows/**` et lancer `app-store-submit.yml` → soumission App Store sans que tu touches à rien.

## 3. Confirmer les permissions Apple (App Store Connect)
- **Action** : vérifier que le rôle du compte permet de soumettre une app (Admin ou App Manager) et que la clé API a l'accès « App Manager ».
- **Lien direct** : https://appstoreconnect.apple.com/access/users
- **Texte vocal à dicter** : « Ouvre App Store Connect, Utilisateurs et accès, et vérifie que mon rôle est Admin ou App Manager. »
- **Résultat attendu** : la clé API ASC peut remplir la fiche et soumettre à la review.

## 4. Fournir la clé Stripe live (`sk_live`)
- **Action** : générer/copier la clé secrète Stripe de production et me la faire ajouter dans les secrets (jamais dans le repo).
- **Lien direct** : https://dashboard.stripe.com/apikeys
- **Texte vocal à dicter** : « Ouvre le tableau de bord Stripe, clés API, et copie la clé secrète live. »
- **Résultat attendu** : paiements réels actifs (au lieu du mode test).

## 5. Activer Apple In-App Purchase / MusicKit
- **Action** : activer les capacités In-App Purchase et MusicKit pour le bundle `com.adelkhatra.keep`.
- **Lien direct** : https://developer.apple.com/account/resources/identifiers/list
- **Texte vocal à dicter** : « Ouvre developer.apple.com, identifiants, sélectionne com point adelkhatra point keep, et active In-App Purchase et MusicKit. »
- **Résultat attendu** : abonnements in-app et lecture Apple Music autorisés par Apple.

## 6. Définir la branche par défaut GitHub + branche de production Vercel
- **Action (GitHub)** : garder/définir `reconcile/claude-main-20260825` comme branche de travail (ne pas basculer sur `main`).
- **Lien direct (GitHub)** : https://github.com/adelkhatra-bit/KEEP/settings/branches
- **Action (Vercel)** : régler la « Production Branch » sur `reconcile/claude-main-20260825`.
- **Lien direct (Vercel)** : https://vercel.com/[ton-compte]/[projet]/settings/git
- **Texte vocal à dicter** : « Sur Vercel, réglages, Git, mets la branche de production sur reconcile slash claude-main-20260825. »
- **Résultat attendu** : les déploiements web partent de la bonne branche, cohérents avec le mobile.

---

> **Prochaine étape** : une fois ces actions faites, dis-moi **« GO Priorité 2 »** et j'enchaîne
> (soumission App Store autonome via le Chemin 0, relance des builds, activation paiements réels).
