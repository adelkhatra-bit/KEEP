type SecretResult = { data: unknown; error: unknown };
type SecretRequest = PromiseLike<SecretResult> & {
  abortSignal?: (signal: AbortSignal) => PromiseLike<SecretResult>;
};

export type IntegrationSecretClient = {
  rpc(name: string, args: { p_key: string }): SecretRequest;
};

export async function getIntegrationSecret(admin: IntegrationSecretClient, key: string): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const request = admin.rpc("service_get_integration_secret", { p_key: key });
    const result = await Promise.race([
      request.abortSignal ? request.abortSignal(AbortSignal.timeout(5000)) : request,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("integration_secret_timeout")), 5000);
      }),
    ]);
    if (!result.error && typeof result.data === "string" && result.data.trim()) return result.data.trim();
  } catch {
    // Les Edge Secrets restent le repli des installations historiques.
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  return (Deno.env.get(key) ?? "").trim();
}

export type AppleMusicToken = { token: string; expiresAt: number };
const TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;
let cached: { fingerprint: string; value: AppleMusicToken } | null = null;

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Même contrat JWT ES256 que le backend Node, avec Web Crypto pour le runtime Edge. */
export async function getAppleMusicToken(admin: IntegrationSecretClient): Promise<AppleMusicToken> {
  const [teamId, keyId, rawPem] = await Promise.all([
    getIntegrationSecret(admin, "APPLE_MUSICKIT_TEAM_ID"),
    getIntegrationSecret(admin, "APPLE_MUSICKIT_KEY_ID"),
    getIntegrationSecret(admin, "APPLE_MUSICKIT_PRIVATE_KEY"),
  ]);
  if (!teamId || !keyId || !rawPem) {
    cached = null;
    throw new Error("apple_music_not_configured");
  }
  const pem = rawPem.replace(/\\n/g, "\n").trim();
  const encoder = new TextEncoder();
  const fingerprint = base64url(new Uint8Array(await crypto.subtle.digest(
    "SHA-256", encoder.encode(JSON.stringify([teamId, keyId, pem])),
  )));
  const now = Math.floor(Date.now() / 1000);
  if (cached?.fingerprint === fingerprint && cached.value.expiresAt - now > 300) return cached.value;
  cached = null;
  try {
    const encodedKey = pem
      .replace(["-----BEGIN", "PRIVATE KEY-----"].join(" "), "")
      .replace(["-----END", "PRIVATE KEY-----"].join(" "), "")
      .replace(/\s/g, "");
    const keyBytes = Uint8Array.from(atob(encodedKey), (char) => char.charCodeAt(0));
    const key = await crypto.subtle.importKey("pkcs8", keyBytes, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    const expiresAt = now + TOKEN_LIFETIME_SECONDS;
    const header = base64url(encoder.encode(JSON.stringify({ alg: "ES256", kid: keyId })));
    const payload = base64url(encoder.encode(JSON.stringify({ iss: teamId, iat: now, exp: expiresAt })));
    const input = `${header}.${payload}`;
    const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(input)));
    const value = { token: `${input}.${base64url(signature)}`, expiresAt };
    cached = { fingerprint, value };
    return value;
  } catch {
    throw new Error("apple_music_credentials_invalid");
  }
}
