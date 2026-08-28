from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected 1 occurrence, got {count}: {old[:140]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

path = 'supabase/functions/keep-admin-control/index.ts'
insert_after = '''async function validateAuddToken(value: string): Promise<AuddValidation> {
'''
# Insert ACR helpers immediately before generateTemporaryPassword, after AudD validator.
marker = '''function generateTemporaryPassword() {
'''
acr_helpers = r'''type AcrCloudValidation = { valid: boolean; status: "ACTIVE" | "EXHAUSTED" | "ERROR"; message: string; providerCode?: number };

function normalizeAcrCloudHost(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function plausibleAcrCloudHost(value: string) {
  const host = normalizeAcrCloudHost(value);
  return /^[a-z0-9.-]+\.acrcloud\.com$/.test(host) && !host.includes("..") && host.length <= 180;
}

async function hmacSha1Base64(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  const bytes = new Uint8Array(signed);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function silentWavBytes(durationMs = 650, sampleRate = 8000) {
  const samples = Math.max(1, Math.floor(sampleRate * durationMs / 1000));
  const dataSize = samples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);
  return new Uint8Array(buffer);
}

async function validateAcrCloudCredentials(hostValue: string, accessKey: string, accessSecret: string): Promise<AcrCloudValidation> {
  const host = normalizeAcrCloudHost(hostValue);
  if (!plausibleAcrCloudHost(hostValue)) {
    return { valid: false, status: "ERROR", message: "Hôte ACRCloud invalide. Utilise le host identify-….acrcloud.com fourni par ton projet ACRCloud." };
  }
  if (accessKey.trim().length < 8 || accessSecret.trim().length < 8 || /\s/.test(accessKey.trim()) || /\s/.test(accessSecret.trim())) {
    return { valid: false, status: "ERROR", message: "Access Key ou Access Secret ACRCloud invalide ou incomplet." };
  }

  const httpMethod = "POST";
  const httpUri = "/v1/identify";
  const dataType = "audio";
  const signatureVersion = "1";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const stringToSign = [httpMethod, httpUri, accessKey.trim(), dataType, signatureVersion, timestamp].join("\n");
  const signature = await hmacSha1Base64(accessSecret.trim(), stringToSign);
  const wav = silentWavBytes();
  const form = new FormData();
  form.append("sample", new Blob([wav], { type: "audio/wav" }), "keep-credential-check.wav");
  form.append("access_key", accessKey.trim());
  form.append("sample_bytes", String(wav.byteLength));
  form.append("timestamp", timestamp);
  form.append("signature", signature);
  form.append("data_type", dataType);
  form.append("signature_version", signatureVersion);

  let response: Response;
  try {
    response = await fetch(`https://${host}${httpUri}`, { method: "POST", body: form, signal: AbortSignal.timeout(10000) });
  } catch {
    return { valid: false, status: "ERROR", message: "Impossible de joindre l'hôte ACRCloud. Vérifie le Host avant sauvegarde." };
  }

  const payload = await response.json().catch(() => null);
  const code = Number(payload?.status?.code ?? -1);
  const providerMessage = String(payload?.status?.msg || `ACRCloud HTTP ${response.status}`);

  // Documentation ACRCloud : 0=succès, 1001=aucun résultat ; ces réponses
  // prouvent que Host + Access Key + signature sont acceptés. Un petit WAV
  // silencieux peut aussi retourner 2004 (empreinte impossible), après auth.
  if (code === 0 || code === 1001 || code === 2004) {
    return { valid: true, status: "ACTIVE", message: "Credentials ACRCloud vérifiés par le fournisseur.", providerCode: code };
  }
  if (code === 3003 || code === 3015) {
    return { valid: true, status: "EXHAUSTED", message: `Credentials ACRCloud authentifiés, mais quota/limite fournisseur atteint (${code}).`, providerCode: code };
  }
  if (code === 3001) return { valid: false, status: "ERROR", message: "ACRCloud refuse l'Access Key. Rien n'a été activé.", providerCode: code };
  if (code === 3014) return { valid: false, status: "ERROR", message: "ACRCloud refuse la signature : vérifie l'Access Secret. Rien n'a été activé.", providerCode: code };
  if (code === 3000) return { valid: false, status: "ERROR", message: "ACRCloud signale un hôte/service incorrect. Rien n'a été activé.", providerCode: code };
  return { valid: false, status: "ERROR", message: `ACRCloud n'a pas confirmé les credentials (${code}: ${providerMessage.slice(0, 140)}). Rien n'a été activé.`, providerCode: code };
}

async function setRecognitionRuntimeStatus(key: "AUDD_API_KEY" | "ACRCLOUD", status: string, message: string | null) {
  const now = new Date().toISOString();
  await admin.from("integration_runtime_status").upsert({
    key,
    status,
    last_checked_at: now,
    last_error: status === "ACTIVE" ? null : message,
    updated_at: now,
  }, { onConflict: "key" });
}

'''
replace_once(path, marker, acr_helpers + marker)

# Generalize reset status for ACRCloud deletions/incomplete config too.
old = '''async function resetIntegrationRuntimeStatus(key: string, configured: boolean) {
  if (key !== "AUDD_API_KEY") return;
  const now = new Date().toISOString();
  await admin.from("integration_runtime_status").upsert({
    key,
    status: configured ? "UNKNOWN" : "NOT_CONFIGURED",
    last_checked_at: now,
    last_error: null,
    updated_at: now,
  }, { onConflict: "key" });
}
'''
new = '''async function resetIntegrationRuntimeStatus(key: string, configured: boolean) {
  const runtimeKey = key.startsWith("ACRCLOUD_") ? "ACRCLOUD" : key;
  if (runtimeKey !== "AUDD_API_KEY" && runtimeKey !== "ACRCLOUD") return;
  const now = new Date().toISOString();
  await admin.from("integration_runtime_status").upsert({
    key: runtimeKey,
    status: configured ? "UNKNOWN" : "NOT_CONFIGURED",
    last_checked_at: now,
    last_error: configured ? "Configuration enregistrée, validation fournisseur en attente." : null,
    updated_at: now,
  }, { onConflict: "key" });
}
'''
replace_once(path, old, new)

# Prospective validation before save.
old = '''      const providerValidation = key === "AUDD_API_KEY" ? await validateAuddToken(value) : null;
      if (providerValidation && !providerValidation.valid) {
        await resetIntegrationRuntimeStatus(key, false);
        return json(400, { error: "invalid_audd_token", message: providerValidation.message, validation: providerValidation });
      }
      const valueHint = hint(value);
'''
new = '''      const providerValidation = key === "AUDD_API_KEY" ? await validateAuddToken(value) : null;
      if (providerValidation && !providerValidation.valid) {
        await resetIntegrationRuntimeStatus(key, false);
        return json(400, { error: "invalid_audd_token", message: providerValidation.message, validation: providerValidation });
      }

      let acrValidation: AcrCloudValidation | null = null;
      let acrBundleComplete = false;
      if (key.startsWith("ACRCLOUD_")) {
        const [savedAccessKey, savedAccessSecret, savedHost] = await Promise.all([
          key === "ACRCLOUD_ACCESS_KEY" ? Promise.resolve(value) : getSecret("ACRCLOUD_ACCESS_KEY"),
          key === "ACRCLOUD_ACCESS_SECRET" ? Promise.resolve(value) : getSecret("ACRCLOUD_ACCESS_SECRET"),
          key === "ACRCLOUD_HOST" ? Promise.resolve(value) : getSecret("ACRCLOUD_HOST"),
        ]);
        acrBundleComplete = Boolean(savedAccessKey && savedAccessSecret && savedHost);
        if (acrBundleComplete) {
          acrValidation = await validateAcrCloudCredentials(String(savedHost), String(savedAccessKey), String(savedAccessSecret));
          if (!acrValidation.valid) {
            await setRecognitionRuntimeStatus("ACRCLOUD", "ERROR", acrValidation.message);
            return json(400, { error: "invalid_acrcloud_credentials", message: acrValidation.message, validation: acrValidation });
          }
        }
      }
      const valueHint = hint(value);
'''
replace_once(path, old, new)

# Runtime status after save.
old = '''      if (key === "AUDD_API_KEY" && providerValidation) {
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
'''
new = '''      if (key === "AUDD_API_KEY" && providerValidation) {
        await setRecognitionRuntimeStatus("AUDD_API_KEY", providerValidation.status, providerValidation.message);
      } else if (key.startsWith("ACRCLOUD_") && acrValidation) {
        await setRecognitionRuntimeStatus("ACRCLOUD", acrValidation.status, acrValidation.message);
      } else if (key.startsWith("ACRCLOUD_") && !acrBundleComplete) {
        await setRecognitionRuntimeStatus("ACRCLOUD", "NOT_CONFIGURED", "Configuration ACRCloud incomplète : renseigne Host + Access Key + Access Secret.");
      } else {
        await resetIntegrationRuntimeStatus(key, true);
      }
      const validation = providerValidation ?? acrValidation;
      await audit(actor.id, "integration_secret.updated", "integration_secret", key, { key, category: meta.category, hint: valueHint, validation });
      return json(200, { ok: true, key, configured: true, hint: valueHint, validation, recognitionReady: key.startsWith("ACRCLOUD_") ? Boolean(acrValidation?.valid) : undefined });
'''
replace_once(path, old, new)

# Delete: ACR should become not-configured as soon as any component is removed, regardless of edge fallback.
old = '''      const edgeStillActive = Boolean(existingEdgeSecret(key));
      await resetIntegrationRuntimeStatus(key, edgeStillActive);
      await audit(actor.id, "integration_secret.deleted", "integration_secret", key, { key, configured: edgeStillActive });
'''
new = '''      const edgeStillActive = Boolean(existingEdgeSecret(key));
      if (key.startsWith("ACRCLOUD_")) {
        await setRecognitionRuntimeStatus("ACRCLOUD", "NOT_CONFIGURED", "Configuration ACRCloud incomplète après suppression d'un credential.");
      } else {
        await resetIntegrationRuntimeStatus(key, edgeStillActive);
      }
      await audit(actor.id, "integration_secret.deleted", "integration_secret", key, { key, configured: edgeStillActive });
'''
replace_once(path, old, new)

# UI: report automatic ACR validation when final credential closes the bundle.
path = 'packages/admin/pages/integrations.tsx'
old = '''      if (row.key === 'AUDD_API_KEY' && result?.validation?.valid) {
        setMessage(`Clé AudD vérifiée par le fournisseur puis enregistrée dans Supabase Vault. État : ${result.validation.status}.`);
      } else {
        setMessage(`${row.label} enregistré dans Supabase Vault. La valeur précédente est remplacée sans être affichée.`);
      }
'''
new = '''      if (row.key === 'AUDD_API_KEY' && result?.validation?.valid) {
        setMessage(`Clé AudD vérifiée par le fournisseur puis enregistrée dans Supabase Vault. État : ${result.validation.status}.`);
      } else if (row.key.startsWith('ACRCLOUD_') && result?.validation?.valid) {
        setMessage(`ACRCloud vérifié par le fournisseur : Host + Access Key + Access Secret sont compatibles. État : ${result.validation.status}. Le fallback est actif immédiatement.`);
      } else if (row.key.startsWith('ACRCLOUD_')) {
        setMessage(`${row.label} enregistré. ACRCloud sera automatiquement testé dès que Host + Access Key + Access Secret seront tous renseignés.`);
      } else {
        setMessage(`${row.label} enregistré dans Supabase Vault. La valeur précédente est remplacée sans être affichée.`);
      }
'''
replace_once(path, old, new)

# Operations page: map all ACR credential rows to shared ACRCLOUD runtime health.
path = 'packages/admin/pages/operations.tsx'
old = '''              const live = runtimeByKey.get(row.key);
              const state = statusInfo(row, live);
'''
new = '''              const live = row.key.startsWith('ACRCLOUD_') ? runtimeByKey.get('ACRCLOUD') : runtimeByKey.get(row.key);
              const state = statusInfo(row, live);
'''
replace_once(path, old, new)

print('ACRCloud prospective credential validation + runtime health applied')
