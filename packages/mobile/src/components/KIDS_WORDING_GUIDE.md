# Kids-Friendly Wording Guide

Ce guide remplace le langage technique par du langage adapté aux enfants de 5-8 ans.

## Principes fondamentaux

1. **Pas de jargon** : "Erreur de chargement" → "Oups !"
2. **Emoji cohérents** : Utilise toujours les mêmes emoji pour la même situation
3. **Court et direct** : Max 2 lignes de texte
4. **Avec action** : Toujours proposer un bouton "Réessayer" ou "Continuer"
5. **Émojis universels** : Utilise uniquement les emoji reconnus par tous (iPhone, Android)

## Dictionnaire de remplacement

### Erreurs de réseau

| Technique | Kid-Friendly | Emoji |
|---|---|---|
| "Network error" | "Internet n'est pas connecté 😅" | 📡 |
| "Connection timeout" | "Ça prend trop de temps. Réessaye ?" | ⏳ |
| "Failed to fetch" | "Oups ! Ça n'a pas marché" | 😅 |
| "404 Not Found" | "On n'a pas trouvé ça" | 🔍 |

### Erreurs utilisateur

| Technique | Kid-Friendly | Emoji |
|---|---|---|
| "Invalid input" | "Ça ne convient pas. Essaie encore !" | ✍️ |
| "Username already taken" | "Ce pseudo est déjà pris. Choisis un autre !" | 🚫 |
| "Password too weak" | "Le mot de passe est trop facile. Rends-le plus difficile !" | 🔐 |
| "Email not verified" | "Regarde tes emails. Tu dois cliquer sur le lien !" | 📧 |

### États vides

| Technique | Kid-Friendly | Emoji |
|---|---|---|
| "No data available" | "Rien à afficher encore" | 📭 |
| "Empty playlist" | "Ta playlist est vide" | 🎵 |
| "No notifications" | "Tu n'as pas de notifications" | 🔔 |
| "No results" | "On n'a rien trouvé" | 🔍 |

### Chargement

| Technique | Kid-Friendly | Emoji |
|---|---|---|
| "Loading..." | "Chargement..." | ⏳ |
| "Please wait" | "Un instant..." | ⌛ |
| "Saving..." | "On enregistre..." | 💾 |
| "Uploading..." | "On envoie..." | 📤 |

### Actions

| Technique | Kid-Friendly | Emoji |
|---|---|---|
| "Proceed" | "Continuer" | ▶️ |
| "Confirm" | "D'accord" | ✓ |
| "Cancel" | "Annuler" | ✕ |
| "Delete" | "Supprimer" | 🗑️ |
| "Save" | "Enregistrer" | 💾 |
| "Retry" | "Réessayer" | 🔄 |

### Verrous / Accès

| Technique | Kid-Friendly | Emoji |
|---|---|---|
| "Feature locked" | "C'est verrouillé 🔒" | 🔐 |
| "Requires premium" | "Tu dois avoir CREATOR_PRO" | 💎 |
| "Access denied" | "Tu peux pas faire ça" | 🚫 |
| "Sign in required" | "Tu dois te connecter d'abord" | 👤 |

## Exemples d'utilisation

### Avant (harsh)

```tsx
<Text style={styles.error}>
  Error: Failed to load user profile. HTTP 500.
</Text>
```

### Après (kids-friendly)

```tsx
<KidsFriendlyErrorBanner
  message="Oups ! Ton profil n'a pas pu se charger. 😅"
  onRetry={retry}
  visible={hasError}
/>
```

## Composants associés

- **KidsFriendlyErrorBanner** : Pour les erreurs
- **KidsEmptyState** : Pour les listes vides
- **KidsLoadingSpinner** : Pour le chargement
- **KidsButton** : Pour les actions (56px minimum)
- **KidsModal** : Pour les confirmations

## Comment migrer

1. Recherche le code original (ex: "Error loading data")
2. Remplace par le texte kid-friendly correspondant
3. Utilise le composant approprié (Error → KidsFriendlyErrorBanner)
4. Teste sur device réel (enfant 7 ans devrait comprendre)

## Règles de style

- Tout en minuscules (sauf noms propres/CREATOR_PRO)
- Utiliser le tutoiement ("Tu", pas "Vous")
- Ajouter emoji à chaque message (1 maximum par ligne)
- Boutons avec action claire (jamais de bouton "Continuer" sans rien faire)

---

**Dernière mise à jour** : 28 septembre 2026  
**Statut** : Phase 5 Kids-Friendly Implementation
