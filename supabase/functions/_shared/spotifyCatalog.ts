import { getIntegrationSecret, type IntegrationSecretClient } from "./appleMusicToken.ts";

export type SpotifyCatalogToken = { token: string; expiresAt: number };
let cachedSpotify: { fingerprint: string; value: SpotifyCatalogToken } | null = null;

/** Jeton serveur client_credentials uniquement : jamais une connexion au compte Spotify utilisateur. */
export async function getSpotifyCatalogToken(admin: IntegrationSecretClient): Promise<SpotifyCatalogToken> {
  const [clientId, clientSecret] = await Promise.all([
    getIntegrationSecret(admin, "SPOTIFY_CLIENT_ID"),
    getIntegrationSecret(admin, "SPOTIFY_CLIENT_SECRET"),
  ]);
  if (!clientId || !clientSecret) {
    cachedSpotify = null;
    throw new Error("spotify_not_configured");
  }

  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(JSON.stringify([clientId, clientSecret])),
  ));
  const fingerprint = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const now = Math.floor(Date.now() / 1000);
  if (cachedSpotify?.fingerprint === fingerprint && cachedSpotify.value.expiresAt - now > 60) return cachedSpotify.value;
  cachedSpotify = null;
  try {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      signal: AbortSignal.timeout(6500),
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!response.ok) throw new Error("spotify_credentials_rejected");
    const payload = await response.json();
    if (typeof payload?.access_token !== "string" || !payload.access_token ||
        !Number.isFinite(payload?.expires_in) || payload.expires_in <= 0) throw new Error("spotify_token_invalid");
    const value = { token: payload.access_token, expiresAt: now + Math.floor(payload.expires_in) };
    cachedSpotify = { fingerprint, value };
    return value;
  } catch {
    throw new Error("spotify_token_unavailable");
  }
}
