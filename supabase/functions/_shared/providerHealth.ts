export type HealthResult = {
  provider: string;
  status: "OK" | "ERROR" | "UNKNOWN";
  last_checked_at: string;
  last_error: string | null;
  latency_ms: number;
  metadata?: Record<string, unknown>;
};

type SecretReader = (key: string) => Promise<string>;
type JsonPayload = Record<string, any> | null;

// All diagnostics are controlled codes: upstream bodies may echo credentials.
async function request(url: string, options: RequestInit = {}): Promise<{ response: Response; body: JsonPayload }> {
  const response = await fetch(url, { ...options, redirect: "error", signal: AbortSignal.timeout(8000) });
  const body = await response.json().catch(() => null);
  return { response, body };
}

export async function validateBrevoApiKey(key: string) {
  const { response } = await request("https://api.brevo.com/v3/account", {
    headers: { "api-key": key, accept: "application/json" },
  });
  return { valid: response.ok, status: response.ok ? "ACTIVE" : "ERROR", message: response.ok ? "Clé Brevo vérifiée par le fournisseur." : `BREVO_HTTP_${response.status}` };
}

export async function validateYouTubeApiKey(key: string) {
  const { response, body } = await request(`https://www.googleapis.com/youtube/v3/videos?part=id&id=dQw4w9WgXcQ&key=${encodeURIComponent(key)}`);
  const quota = /quota|dailyLimit|rateLimit/i.test(String(body?.error?.errors?.[0]?.reason || ""));
  const disabled = /accessNotConfigured|serviceDisabled/i.test(String(body?.error?.errors?.[0]?.reason || ""));
  return { valid: response.ok || quota || disabled, status: response.ok ? "ACTIVE" : quota ? "EXHAUSTED" : "ERROR", message: response.ok ? "Clé YouTube Data API vérifiée." : quota ? "YOUTUBE_QUOTA_EXHAUSTED" : `YOUTUBE_HTTP_${response.status}` };
}

export async function validateAcrCloudCredentials(hostValue: string, accessKey: string, accessSecret: string) {
  const host = hostValue.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!/^[a-z0-9.-]+\.acrcloud\.com$/.test(host) || host.includes("..") || host.length > 180) {
    return { valid: false, status: "ERROR", message: "ACRCLOUD_INVALID_HOST" };
  }
  const timestamp = String(Math.floor(Date.now() / 1000));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(accessSecret.trim()), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(["POST", "/v1/identify", accessKey.trim(), "audio", "1", timestamp].join("\n"))));
  const wav = new Uint8Array(44 + 5200 * 2);
  const view = new DataView(wav.buffer);
  const ascii = (offset: number, value: string) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  ascii(0, "RIFF"); view.setUint32(4, wav.length - 8, true); ascii(8, "WAVE");
  ascii(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, 8000, true); view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); ascii(36, "data"); view.setUint32(40, wav.length - 44, true);
  const form = new FormData();
  form.append("sample", new Blob([wav], { type: "audio/wav" }), "health.wav");
  form.append("access_key", accessKey.trim()); form.append("sample_bytes", String(wav.length));
  form.append("timestamp", timestamp); form.append("signature", btoa(String.fromCharCode(...signature)));
  form.append("data_type", "audio"); form.append("signature_version", "1");
  const { response, body } = await request(`https://${host}/v1/identify`, { method: "POST", body: form });
  const code = Number(body?.status?.code ?? -1);
  const accepted = response.ok && [0, 1001, 2004].includes(code);
  const exhausted = response.ok && [3003, 3015].includes(code);
  return { valid: accepted || exhausted, status: accepted ? "ACTIVE" : exhausted ? "EXHAUSTED" : "ERROR", message: accepted ? "Credentials ACRCloud vérifiés par le fournisseur." : `ACRCLOUD_HTTP_${response.status}_CODE_${code}`, providerCode: code };
}

async function appleToken(secret: SecretReader) {
  const [team, id, pem] = await Promise.all(["APPLE_MUSICKIT_TEAM_ID", "APPLE_MUSICKIT_KEY_ID", "APPLE_MUSICKIT_PRIVATE_KEY"].map(secret));
  if (!team || !id || !pem) return null;
  const encode = (data: Uint8Array) => btoa(String.fromCharCode(...data)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  const json = (value: unknown) => encode(new TextEncoder().encode(JSON.stringify(value)));
  const iat = Math.floor(Date.now() / 1000);
  const input = `${json({ alg: "ES256", kid: id })}.${json({ iss: team, iat, exp: iat + 600 })}`;
  const bytes = Uint8Array.from(atob(pem.replaceAll("\\n", "\n").replace(/-----[^-]+-----|\s/g, "")), (x) => x.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", bytes, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(input)));
  return `${input}.${encode(signature)}`;
}

export async function probeProviders(secret: SecretReader): Promise<HealthResult[]> {
  // Five-minute cron = 288 scheduled checks per configured provider/day.
  // ACR identify and synthetic Google translations can consume quota/cost.
  // Probes never send an email/push; incident delivery uses the existing queues.
  const probes: [string, () => Promise<{ status: string; message: string }>][] = [
    ["ACRCLOUD", async () => {
      const [host, key, signingSecret] = await Promise.all(["ACRCLOUD_HOST", "ACRCLOUD_ACCESS_KEY", "ACRCLOUD_ACCESS_SECRET"].map(secret));
      if (!host || !key || !signingSecret) return { status: "UNKNOWN", message: "NOT_CONFIGURED" };
      return validateAcrCloudCredentials(host, key, signingSecret);
    }],
    ["BREVO", async () => { const key = await secret("BREVO_API_KEY"); return key ? validateBrevoApiKey(key) : { status: "UNKNOWN", message: "NOT_CONFIGURED" }; }],
    ["YOUTUBE", async () => { const key = await secret("YOUTUBE_API_KEY"); return key ? validateYouTubeApiKey(key) : { status: "UNKNOWN", message: "NOT_CONFIGURED" }; }],
    ["GOOGLE_TRANSLATE", async () => {
      const key = await secret("GOOGLE_TRANSLATE_API_KEY");
      if (!key) return { status: "UNKNOWN", message: "NOT_CONFIGURED" };
      const { response, body } = await request(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ q: "Hello", source: "en", target: "fr", format: "text" }),
      });
      return { status: response.ok && Boolean(body?.data?.translations?.[0]?.translatedText) ? "ACTIVE" : "ERROR", message: `TRANSLATE_HTTP_${response.status}` };
    }],
    ["APPLE_MUSIC_TOKEN", async () => {
      const token = await appleToken(secret);
      if (!token) return { status: "UNKNOWN", message: "NOT_CONFIGURED" };
      const headers = new Headers();
      headers.set("Authorization", "Bearer ".concat(token));
      const { response, body } = await request("https://api.music.apple.com/v1/catalog/fr/songs/1440841363", { headers });
      return { status: response.ok && Array.isArray(body?.data) && body.data.length > 0 ? "ACTIVE" : "ERROR", message: `APPLE_HTTP_${response.status}` };
    }],
    ["EXPO_PUSH", async () => {
      // Empty receipts query is read-only: never sends a push to a real device.
      const { response, body } = await request("https://exp.host/--/api/v2/push/getReceipts", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: [] }),
      });
      return { status: response.ok && body?.data && !body?.errors ? "ACTIVE" : "ERROR", message: `EXPO_HTTP_${response.status}` };
    }],
  ];
  return Promise.all(probes.map(async ([provider, probe]) => {
    const start = Date.now();
    try {
      const result = await probe();
      const status = result.status === "ACTIVE" ? "OK" : result.status === "UNKNOWN" ? "UNKNOWN" : "ERROR";
      // Never store the provider's free-form message.
      const code = status === "UNKNOWN" ? "NOT_CONFIGURED" : status === "ERROR" ? (result.status === "EXHAUSTED" ? "QUOTA_EXHAUSTED" : "PROVIDER_CHECK_FAILED") : null;
      return {
        provider, status, last_error: code, last_checked_at: new Date().toISOString(), latency_ms: Date.now() - start,
        metadata: { scheduled_checks_per_day: 288,
          probe_scope: provider === "EXPO_PUSH" ? "Receipts API reachable; no push sent; device/APNs delivery not tested"
          : provider === "BREVO" ? "Account API authentication; email delivery not tested"
          : provider === "ACRCLOUD" ? "Signed silent-audio identify check; may consume recognition quota/cost"
          : provider === "APPLE_MUSIC_TOKEN" ? "Signed developer token accepted by catalog API"
          : provider === "GOOGLE_TRANSLATE" ? "Translation of one synthetic word; may consume translation quota/cost"
          : "YouTube Data API credential/quota check" },
      } as HealthResult;
    } catch {
      return { provider, status: "ERROR", last_error: "PROBE_TIMEOUT_OR_FAILURE", last_checked_at: new Date().toISOString(), latency_ms: Date.now() - start } as HealthResult;
    }
  }));
}
