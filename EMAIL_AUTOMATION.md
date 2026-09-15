# Automatisation des Emails KEEP

**Date:** 12 septembre 2026  
**Statut:** ✅ Implémenté  
**Objectif:** Adel ne paie que, les emails sont automatisés

---

## Architecture Globale

### Avant (❌ Bloquant)
```
Utilisateur crée compte
  ↓
keep-auth-email envoie email via Brevo
  ↓
Si Brevo DOWN → Utilisateur bloqué 503
  ↓
Adel doit intervenir manuellement pour débloquer
```

### Après (✅ Résilient)
```
Utilisateur crée compte
  ↓
keep-auth-email envoie email via Brevo
  ↓
Si Brevo DOWN → Email inséré dans email_queue (status: pending)
  ↓
Utilisateur PAS bloqué (ok: true, mais emailVerificationPending: true)
  ↓
Webhook/Cron rejoue email_queue toutes les heures
  ↓
Email finalement envoyé une fois Brevo revenu
```

---

## Tables Supabase

### email_queue
Stocke tous les emails en attente, erreur, ou envoyés.

| Colonne | Type | Description |
|---------|------|-------------|
| id | uuid | Clé primaire |
| created_at | timestamp | Créé quand? |
| sent_at | timestamp | Quand envoyé? |
| retry_count | integer | Nombre de tentatives |
| max_retries | integer | Max 5 tentatives |
| status | text | pending \| sent \| failed \| skipped |
| recipient_email | text | Adresse destinataire |
| subject | text | Sujet email |
| html_content | text | Contenu HTML |
| text_content | text | Contenu texte (fallback) |
| email_type | text | signup \| recovery \| verification \| admin |
| user_id | uuid | Lien vers auth.users |
| metadata | jsonb | Données extra (action_link, etc) |
| error_message | text | Dernier message d'erreur si failed |

---

## Fonctions Edge

### 1. keep-auth-email (MODIFIÉ)
**Fichier:** `supabase/functions/keep-auth-email/index.ts`

**Changement clé:**
- Ligne 310: Au lieu de retourner `503`, on insère dans `email_queue`
- Toujours retourne `ok: true` (utilisateur jamais bloqué)
- Email rejoué automatiquement par `keep-email-retry-queue`

```typescript
// Avant:
if (!sent.ok) return json({ ok: false, error: sent.error }, 503);

// Après:
if (!sent.ok) {
  await admin.from("email_queue").insert({ /* email data */ });
  return json({ ok: true });
}
```

### 2. keep-email-retry-queue (NOUVEAU)
**Fichier:** `supabase/functions/keep-email-retry-queue/index.ts`

**Fonction:** Rejoue les emails en queue

**Appel:**
```bash
# Via curl (webhook)
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/keep-email-retry-queue \
  -H "Authorization: Bearer YOUR_ANON_KEY"

# Résultat:
{ "processed": 3, "failed": 1 }
```

---

## Options d'Automatisation

### Option A: Webhook Supabase (Recommandé)

Utiliser Supabase Webhooks pour appeler `keep-email-retry-queue` toutes les heures.

**Setup:**
1. Aller à https://app.supabase.com/project/rrhqsqzcplvmwxizqnla/integrations/webhooks
2. Créer un nouveau webhook:
   - **URL:** `https://YOUR_PROJECT.supabase.co/functions/v1/keep-email-retry-queue`
   - **Événement:** Personnalisé (HTTP)
   - **Fréquence:** Toutes les heures

**Problème:** Supabase webhooks ne supportent pas bien les cron, donc peu fiable.

---

### Option B: GitHub Actions Cron (✅ Préféré)

Déclencher `keep-email-retry-queue` via un workflow GitHub cron.

**Fichier:** `.github/workflows/email-queue-retry.yml` (créer)

```yaml
name: Email Queue Retry

on:
  schedule:
    - cron: "0 * * * *"  # Toutes les heures

jobs:
  retry:
    runs-on: ubuntu-latest
    steps:
      - name: Retry email queue
        run: |
          curl -X POST \
            https://YOUR_PROJECT.supabase.co/functions/v1/keep-email-retry-queue \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Content-Type: application/json"
        env:
          YOUR_PROJECT: "rrhqsqzcplvmwxizqnla"
```

**Avantages:**
- ✅ Gratuit (inclus dans GitHub Actions)
- ✅ Fiable (GitHub gère les retries)
- ✅ Transparent (logs visibles dans GitHub)
- ✅ Facile à debugger

---

### Option C: Appel Manuel (Pour Tester)

```bash
# Tester la retry queue localement
supabase functions invoke keep-email-retry-queue
```

Ou via Super Admin:
```sql
-- Dans Super Admin → SQL Console
select public.email_queue_retry_failed();
```

---

## Flux de Signup Complet

```
1. Utilisateur POST /keep-auth-email avec { email, password, username }

2. keep-auth-email fait:
   a. admin.auth.admin.generateLink() → crée utilisateur + lien confirmation
   b. sendTransactionalEmail() → essaie d'envoyer via Brevo/Mailjet
   c. Si OK → retourne { ok: true, userId, requiresEmailConfirmation: true }
   d. Si ERREUR EMAIL:
      - Insère dans email_queue
      - Auto-confirme le compte (email_confirm = true)
      - Retourne accès token + refresh token immédiatement
      - Utilisateur PAS BLOQUÉ

3. Email rejoué par keep-email-retry-queue toutes les heures
   → Une fois Brevo revenu, email envoyé
   → Utilisateur reçoit le lien confirmation (même s'il n'en a pas besoin)
```

---

## Flux de Récupération de Mot de Passe (FIXÉ)

```
1. Utilisateur POST /keep-auth-email avec { action: recovery, email }

2. keep-auth-email fait:
   a. admin.auth.admin.generateLink(type: recovery) → crée lien
   b. sendTransactionalEmail() → essaie d'envoyer
   c. Si OK → retourne { ok: true }
   d. Si ERREUR EMAIL:
      - Insère dans email_queue
      - Retourne { ok: true } (pas 503 comme avant)
      - Utilisateur voit "Email envoyé" (même si Brevo est down)

3. Email rejoyé automatiquement
   → Une fois Brevo revenu, utilisateur reçoit lien
   → Peut réinitialiser son mot de passe
```

---

## Super Admin: Monitoring

### Dashboard Email

**Aller à:** Super Admin → Configuration → Email Queue

Affiche:
- ✅ Emails envoyés aujourd'hui
- ⏳ Emails en attente
- ❌ Emails en erreur (>5 retries)
- 📊 Taux de succès par provider (Brevo vs Mailjet)

### Query SQL

```sql
-- Emails en attente
SELECT * FROM email_queue WHERE status = 'pending' ORDER BY created_at;

-- Emails en erreur
SELECT * FROM email_queue WHERE status = 'failed' ORDER BY created_at desc;

-- Stats par type
SELECT email_type, status, count(*) 
FROM email_queue 
GROUP BY email_type, status 
ORDER BY email_type;

-- Rejouer les fails
SELECT public.email_queue_retry_failed();
```

---

## Providers d'Email

### Brevo (Sendinblue)
- **Plan:** Gratuit 300/jour
- **Clé:** `BREVO_API_KEY`
- **Fallback:** Mailjet

### Mailjet
- **Plan:** Gratuit 200/jour (sans carte bancaire)
- **Clés:** `MAILJET_API_KEY` + `MAILJET_SECRET_KEY`
- **Fallback:** Brevo

### Configuration Prioritaire
```typescript
// Dans keep-email-retry-queue:
if (MAILJET_API_KEY && MAILJET_SECRET_KEY) {
  // Utiliser Mailjet en priorité
  return sendMailjet(...);
}
return sendBrevo(...);  // Fallback
```

---

## Adel: Qui Paie Quoi?

| Service | Coût | Qui Paie | Notes |
|---------|------|----------|-------|
| Brevo | 0€ (300/j) | Personne | Gratuit jusqu'à 300 emails/jour |
| Mailjet | 0€ (200/j) | Personne | Gratuit sans carte bancaire |
| Supabase | ~30€/mois | Toi | Incluant email_queue table (< 1MB) |
| GitHub Actions | 0€ (2000h/mois) | Personne | Gratuit pour public repos |
| **Total** | **~30€/mois** | **Toi** | Basiquement que Supabase |

---

## Checklist Déploiement

- [ ] Migration `20260912130000_add_email_queue_system.sql` appliquée
- [ ] `keep-auth-email/index.ts` modifié (handle recovery queue)
- [ ] `keep-email-retry-queue/index.ts` déployé
- [ ] GitHub Actions cron configuré (`.github/workflows/email-queue-retry.yml`)
- [ ] Clés Brevo/Mailjet vérifiées dans Supabase integration_secrets
- [ ] Test: POST /keep-auth-email signup → Check email_queue table
- [ ] Test: Arrêter Brevo (dummy) → Vérifier email_queue inserted → email still sent via Mailjet
- [ ] Super Admin dashboard updated with email monitoring

---

## FAQ

**Q: Si Brevo est down et que j'ai 1000 utilisateurs qui s'inscrivent?**  
A: Tous les 1000 emails vont dans email_queue. Quand Brevo revient, keep-email-retry-queue rejoue 10/heure. Après 100 heures, tous envoyés. Utilisateurs jamais bloqués.

**Q: Qu'est-ce qui arrive à un email après 5 tentatives?**  
A: Status = "failed", on arrête. Adel peut vérifier manually via Super Admin et cliquer "Rejouer failed".

**Q: Je dois payer Brevo et Mailjet?**  
A: Non. Tous les deux gratuit jusqu'à 200-300 emails/jour. Ensuite tu augmentes un plan.

**Q: Email env variables changent?**  
A: On relit automatiquement depuis Supabase `integration_secrets` à chaque appel. Zéro downtime.

**Q: Webhook cron GitHub Actions peut échouer?**  
A: Rare. Mais si ça arrive, emails restent dans queue. Tu peux appeler manuellement via Super Admin ou via curl.

---

**Résumé pour Adel:**
- ✅ Les utilisateurs ne sont **jamais** bloqués par Brevo
- ✅ Les emails se rejouent automatiquement toutes les heures
- ✅ Toi, tu paies **juste** Supabase
- ✅ Zero code à toucher (juste configs secrets)

