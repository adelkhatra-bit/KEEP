import { SignJWT, importPKCS8 } from "npm:jose@5.9.6";

export type IntegrationSecretClient = {
  rpc: (name: string, args: { p_key: string }) => PromiseLike<{ data: unknown; error: unknown }>;
};

export type ProviderToken = { token: string; expiresAt: number };
type CachedToken = ProviderToken & { fingerprint: string };
type TokenState = { cached?: CachedToken; pending: Map<string, Promise<ProviderToken | null>> };
const appleStates = new WeakMap<IntegrationSecretClient, TokenState>();
const spotifyStates = new WeakMap<IntegrationSecretClient, TokenState>();
const APPLE_TOKEN_SECONDS = 12 * 60 * 60;

export async function readIntegrationSecret(admin: IntegrationSecretClient, key: string): Promise<string> {
  try {
    const { data, error } = await admin.rpc("service_get_integration_secret", { p_key: key });
    if (!error && typeof data === "string" && data.trim()) return data.trim();
  } catch { /* Environment fallback when Vault is unavailable. */ }
  return String(Deno.env.get(key) ?? "").trim();
}

async function credentialFingerprint(values: string[]): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(values)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function cachedToken(
  states: WeakMap<IntegrationSecretClient, TokenState>,
  admin: IntegrationSecretClient,
  credentials: string[],
  create: () => Promise<ProviderToken | null>,
): Promise<ProviderToken | null> {
  let state = states.get(admin);
  if (!state) {
    state = { pending: new Map() };
    states.set(admin, state);
  }
  if (credentials.some((value) => !value)) {
    state.cached = undefined;
    return null;
  }
  const fingerprint = await credentialFingerprint(credentials);
  if (state.cached?.fingerprint === fingerprint && state.cached.expiresAt > Date.now() / 1000 + 60) {
    return { token: state.cached.token, expiresAt: state.cached.expiresAt };
  }
  // Read credentials on every call: rotation must never reuse a former key's token.
  if (state.cached?.fingerprint !== fingerprint) state.cached = undefined;
  const pending = state.pending.get(fingerprint);
  if (pending) return pending;
  const request = create().catch(() => null).then((result) => {
    if (result) state.cached = { ...result, fingerprint };
    return result;
  }).finally(() => { state.pending.delete(fingerprint); });
  state.pending.set(fingerprint, request);
  return request;
}

export async function getAppleMusicDeveloperToken(admin: IntegrationSecretClient): Promise<ProviderToken | null> {
  const [teamId, keyId, rawKey] = await Promise.all([
    readIntegrationSecret(admin, "APPLE_MUSICKIT_TEAM_ID"),
    readIntegrationSecret(admin, "APPLE_MUSICKIT_KEY_ID"),
    readIntegrationSecret(admin, "APPLE_MUSICKIT_PRIVATE_KEY"),
  ]);
  const privateKey = rawKey.replace(/\\n/g, "\n");
  return cachedToken(appleStates, admin, [teamId, keyId, privateKey], async () => {
    if (!/^[A-Z0-9]{10}$/.test(teamId) || !/^[A-Z0-9]{10}$/.test(keyId)) return null;
    const key = await importPKCS8(privateKey, "ES256");
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + APPLE_TOKEN_SECONDS;
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
      .setIssuer(teamId).setIssuedAt(issuedAt).setExpirationTime(expiresAt).sign(key);
    return { token, expiresAt };
  });
}

export async function getSpotifyAccessToken(admin: IntegrationSecretClient): Promise<ProviderToken | null> {
  const [clientId, clientSecret] = await Promise.all([
    readIntegrationSecret(admin, "SPOTIFY_CLIENT_ID"),
    readIntegrationSecret(admin, "SPOTIFY_CLIENT_SECRET"),
  ]);
  return cachedToken(spotifyStates, admin, [clientId, clientSecret], async () => {
    const startedAt = Math.floor(Date.now() / 1000);
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
      signal: AbortSignal.timeout(6500),
      redirect: "error",
    });
    if (!response.ok) return null;
    const payload = await response.json();
    if (typeof payload?.access_token !== "string" || !payload.access_token ||
      String(payload.token_type).toLowerCase() !== "bearer" ||
      !Number.isFinite(payload.expires_in) || payload.expires_in <= 60) return null;
    return { token: payload.access_token, expiresAt: startedAt + Math.min(payload.expires_in, 3600) };
  });
}
