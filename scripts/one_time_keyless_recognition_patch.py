from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected 1 occurrence, got {count}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# Mobile: use the existing social-share handoff as a no-key recognition path.
path = 'packages/mobile/src/services/keepMusicCoreRecognition.ts'
replace_once(
    path,
    "import { getSupabaseAccessToken, supabase } from './supabaseClient';",
    "import { getSupabaseAccessToken, supabase } from './supabaseClient';\nimport { getSharedMusicSource } from './sharedMusicSourceService';",
)
replace_once(
    path,
    "const PROVIDER_RATE_LIMIT_BACKOFF_MS = 65 * 1000;\nlet fallbackUnavailableUntil = 0;\nlet recognitionBackoffUntil = 0;",
    "const PROVIDER_RATE_LIMIT_BACKOFF_MS = 65 * 1000;\nconst KEYLESS_SOURCE_RECHECK_MS = 15 * 1000;\nlet fallbackUnavailableUntil = 0;\nlet recognitionBackoffUntil = 0;\nlet lastKeylessSourceSignature = '';\nlet lastKeylessSourceAttemptAt = 0;",
)
needle = """function attemptMessage(attempt: RecognitionAttempt): string {
  const code = String(attempt.payload?.error || '');
  if (code === 'recognition_not_configured') return 'Reconnaissance musicale indisponible : configure une clé AudD valide ou ACRCloud dans le Super Admin KEEP.';
  if (code === 'recognition_quota_exhausted') return 'Quota AudD épuisé : KEEP utilisera ACRCloud dès qu’il est configuré.';
  if (code === 'recognition_network_error' || code === 'recognition_gateway_error') return 'Reconnaissance temporairement indisponible. KEEP continue d’écouter et réessaiera automatiquement.';
  return String(attempt.payload?.message || attempt.payload?.error || (attempt.status ? `HTTP ${attempt.status}` : 'Reconnaissance indisponible'));
}
"""
replacement = """async function keylessSourceRecognition(accessToken: string | null): Promise<RecognitionResult | null> {
  const source = await getSharedMusicSource();
  if (!source) return null;

  const signature = `${source.sharedAt}|${source.url}|${source.title ?? ''}|${source.rawText ?? ''}`;
  const now = Date.now();
  if (signature === lastKeylessSourceSignature && now - lastKeylessSourceAttemptAt < KEYLESS_SOURCE_RECHECK_MS) return null;
  lastKeylessSourceSignature = signature;
  lastKeylessSourceAttemptAt = now;

  try {
    const response = await fetch(`${SUPABASE_URL!.replace(/\\/$/, '')}/functions/v1/keep-music-keyless-source`, {
      method: 'POST',
      headers: {
        ...baseHeaders(accessToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: source.url,
        rawText: source.rawText ?? null,
        title: source.title ?? null,
        platform: source.platform,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.recognition) return null;
    return payload.recognition as RecognitionResult;
  } catch {
    // Le mode sans clé est best-effort et ne doit jamais interrompre le micro.
    return null;
  }
}
"""
replace_once(path, needle, replacement)
replace_once(
    path,
    """    if (fallbackKnownUnavailable()) {
      if (primaryRateLimited) {
        recognitionBackoffUntil = Date.now() + PROVIDER_RATE_LIMIT_BACKOFF_MS;
        return null;
      }
      if (primary.ok) return null;
      throw new Error(attemptMessage(primary));
    }
""",
    """    if (fallbackKnownUnavailable()) {
      const keyless = await keylessSourceRecognition(accessToken);
      if (keyless) {
        recognitionBackoffUntil = 0;
        return keyless;
      }
      if (primaryRateLimited) recognitionBackoffUntil = Date.now() + PROVIDER_RATE_LIMIT_BACKOFF_MS;
      // AudD/ACRCloud absents ou indisponibles ne deviennent jamais une erreur
      // rouge utilisateur : KEEP continue d'écouter et le partage social reste actif.
      return null;
    }
""",
)
replace_once(
    path,
    """    if (fallback.ok && fallback.payload?.recognition) {
      fallbackUnavailableUntil = 0;
      recognitionBackoffUntil = 0;
      return fallback.payload.recognition as RecognitionResult;
    }

    if (fallback.status === 429 || fallback.payload?.error === 'fallback_rate_limited') {
""",
    """    if (fallback.ok && fallback.payload?.recognition) {
      fallbackUnavailableUntil = 0;
      recognitionBackoffUntil = 0;
      return fallback.payload.recognition as RecognitionResult;
    }

    const keyless = await keylessSourceRecognition(accessToken);
    if (keyless) {
      recognitionBackoffUntil = 0;
      return keyless;
    }

    if (fallback.status === 429 || fallback.payload?.error === 'fallback_rate_limited') {
""",
)
replace_once(
    path,
    """      if (primary.ok) return null;
      throw new Error(attemptMessage(primary));
    }

    // Si les deux moteurs ont été tentés mais ne trouvent rien, on évite une
    // fausse erreur rouge : l'écoute continue et réessaiera au prochain extrait.
    if (primary.ok || fallback.ok) return null;
    throw new Error(attemptMessage(primary));
""",
    """      return null;
    }

    // Avec ou sans fournisseur payant, une panne de reconnaissance ne coupe
    // jamais la session. Le micro continue et le moteur sans clé sera retenté
    // dès qu'un nouveau partage social fournit des métadonnées exploitables.
    return null;
""",
)
replace_once(
    path,
    " * 2. ACRCloud via `keep-music-fallback` uniquement si AudD ne reconnaît pas\n *    le morceau ou rencontre un incident.\n *\n * Spotify/YouTube/Deezer/Apple servent ensuite à enrichir le morceau reconnu ;",
    " * 2. ACRCloud via `keep-music-fallback` uniquement si AudD ne reconnaît pas\n *    le morceau ou rencontre un incident,\n * 3. sans clé : métadonnées publiques du partage social + catalogue iTunes.\n *\n * Spotify/YouTube/Deezer/Apple servent ensuite à enrichir le morceau reconnu ;",
)

# Super Admin Edge: reject invalid AudD credentials before they ever reach Vault.
path = 'supabase/functions/keep-admin-control/index.ts'
replace_once(
    path,
    """function existingEdgeSecret(key: string): string | null {
  const value = Deno.env.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
""",
    """function existingEdgeSecret(key: string): string | null {
  const value = Deno.env.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function plausibleAuddToken(value: string | null | undefined): value is string {
  if (!value) return false;
  const clean = value.trim();
  if (clean.length < 16 || clean.length > 256 || /\\s/.test(clean)) return false;
  if (/^(test|demo|null|none|todo|fake|key|token|1234)$/i.test(clean)) return false;
  return true;
}

type AuddValidation = { valid: boolean; status: "ACTIVE" | "EXHAUSTED" | "ERROR"; message: string };

async function validateAuddToken(value: string): Promise<AuddValidation> {
  if (!plausibleAuddToken(value)) {
    return { valid: false, status: "ERROR", message: "Clé AudD invalide : le token est trop court ou ressemble à une valeur de test." };
  }

  const form = new FormData();
  form.append("api_token", value);
  let response: Response;
  try {
    response = await fetch("https://api.audd.io/", { method: "POST", body: form });
  } catch {
    return { valid: false, status: "ERROR", message: "Impossible de joindre AudD pour valider la clé. Réessaie sans enregistrer une clé non vérifiée." };
  }

  const payload = await response.json().catch(() => null);
  const code = Number(payload?.error?.error_code ?? payload?.error?.code ?? 0);
  const providerMessage = String(payload?.error?.error_message || payload?.error?.message || payload?.message || `AudD HTTP ${response.status}`);
  if (code === 900 || code === 901 || /invalid\\s+(?:api\\s*)?(?:key|token)|authorization|no api[_ -]?token/i.test(providerMessage)) {
    return { valid: false, status: "ERROR", message: "AudD a refusé ce token. Rien n'a été enregistré." };
  }
  if (response.status === 402 || /quota|credit|balance|limit\\s+(?:reached|exceeded)|payment|subscription|exhaust/i.test(providerMessage)) {
    return { valid: true, status: "EXHAUSTED", message: "Token AudD authentifié, mais quota/crédit fournisseur épuisé." };
  }
  // AudD #700 = authentification acceptée, fichier audio absent. C'est le test
  // volontaire utilisé ici pour valider le token sans consommer une reconnaissance.
  if (code === 700 || payload?.status === "success") {
    return { valid: true, status: "ACTIVE", message: "Token AudD vérifié par le fournisseur." };
  }
  return { valid: false, status: "ERROR", message: `AudD n'a pas confirmé le token (${providerMessage.slice(0, 160)}). Rien n'a été enregistré.` };
}
""",
)
replace_once(
    path,
    """      if (!meta) return json(400, { error: "integration_key_not_allowed" });
      if (!value) return json(400, { error: "value_required" });
      const valueHint = hint(value);
""",
    """      if (!meta) return json(400, { error: "integration_key_not_allowed" });
      if (!value) return json(400, { error: "value_required" });
      const providerValidation = key === "AUDD_API_KEY" ? await validateAuddToken(value) : null;
      if (providerValidation && !providerValidation.valid) {
        await resetIntegrationRuntimeStatus(key, false);
        return json(400, { error: "invalid_audd_token", message: providerValidation.message, validation: providerValidation });
      }
      const valueHint = hint(value);
""",
)
replace_once(
    path,
    """      if (error) throw error;
      await resetIntegrationRuntimeStatus(key, true);
      await audit(actor.id, "integration_secret.updated", "integration_secret", key, { key, category: meta.category, hint: valueHint });
      return json(200, { ok: true, key, configured: true, hint: valueHint });
""",
    """      if (error) throw error;
      if (key === "AUDD_API_KEY" && providerValidation) {
        const now = new Date().toISOString();
        await admin.from("integration_runtime_status").upsert({
          key,
          status: providerValidation.status,
          last_checked_at: now,
          last_error: providerValidation.status === "ACTIVE" ? null : providerValidation.message,
          updated_at: now,
        }, { onConflict: "key" });
      } else {
        await resetIntegrationRuntimeStatus(key, true);
      }
      await audit(actor.id, "integration_secret.updated", "integration_secret", key, { key, category: meta.category, hint: valueHint, validation: providerValidation });
      return json(200, { ok: true, key, configured: true, hint: valueHint, validation: providerValidation });
""",
)

# Super Admin UI: state clearly what works without a key and report real validation.
path = 'packages/admin/pages/integrations.tsx'
replace_once(
    path,
    """      await invokeAdmin({ action: 'integrations.set', key: row.key, value });
      setValues((prev) => ({ ...prev, [row.key]: '' }));
      setMessage(`${row.label} enregistré dans Supabase Vault. La valeur précédente est remplacée sans être affichée.`);
""",
    """      const result = await invokeAdmin({ action: 'integrations.set', key: row.key, value });
      setValues((prev) => ({ ...prev, [row.key]: '' }));
      if (row.key === 'AUDD_API_KEY' && result?.validation?.valid) {
        setMessage(`Clé AudD vérifiée par le fournisseur puis enregistrée dans Supabase Vault. État : ${result.validation.status}.`);
      } else {
        setMessage(`${row.label} enregistré dans Supabase Vault. La valeur précédente est remplacée sans être affichée.`);
      }
""",
)
replace_once(
    path,
    """                <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
                  Clé de test actuelle : 10 requêtes/jour. Un compte AudD réel bénéficie d’un quota gratuit initial, puis d’une facturation fournisseur.
                </div>
""",
    """                <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
                  Sans clé, KEEP exploite déjà le partage TikTok / YouTube / Instagram / Snapchat et les métadonnées publiques. Une clé AudD valide active automatiquement l’empreinte audio complète. Toute clé AudD invalide est refusée avant sauvegarde.
                </div>
""",
)

print('Keyless social fallback + AudD validation patch applied')
