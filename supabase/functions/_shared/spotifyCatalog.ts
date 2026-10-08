import { getSpotifyAccessToken, type IntegrationSecretClient } from "./musicProviderCredentials.ts";
import type { MusicCredentialValidation } from "./appleMusicToken.ts";
import { spotifyCatalogTrack } from "./musicProviderCatalog.ts";

export { getSpotifyAccessToken } from "./musicProviderCredentials.ts";
export { searchSpotifyCatalog, lookupSpotifyCatalog } from "./musicProviderCatalog.ts";

export async function validateSpotifyCredentials(clientId: string, secret: string): Promise<MusicCredentialValidation> {
  const credentials: Record<string, string> = {
    SPOTIFY_CLIENT_ID: String(clientId ?? "").trim(),
    SPOTIFY_CLIENT_SECRET: String(secret ?? "").trim(),
  };
  if (Object.values(credentials).every((value) => !value)) {
    return { valid: false, status: "NOT_CONFIGURED", message: "Spotify n’est pas configuré." };
  }
  if (Object.values(credentials).some((value) => !value)) {
    return { valid: false, status: "ERROR", message: "Les deux identifiants Spotify sont requis." };
  }
  const client: IntegrationSecretClient = {
    rpc: async (_name, args) => ({ data: credentials[args.p_key] ?? null, error: null }),
  };
  try {
    const token = await getSpotifyAccessToken(client);
    if (!token) return { valid: false, status: "ERROR", message: "Spotify refuse les identifiants ou est indisponible." };
    const response = await fetch("https://api.spotify.com/v1/search?q=Daft%20Punk&type=track&market=FR&limit=1", {
      headers: { Authorization: "Bearer " + token.token },
      signal: AbortSignal.timeout(6500),
      redirect: "error",
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      if (response.status === 429) return { valid: false, status: "EXHAUSTED", message: "Le quota du catalogue Spotify est temporairement atteint." };
      return { valid: false, status: "ERROR", message: "Le catalogue Spotify refuse les identifiants ou est indisponible." };
    }
    const payload = await response.json();
    if (!Array.isArray(payload?.tracks?.items) || !payload.tracks.items.some((row: unknown) => spotifyCatalogTrack(row))) {
      return { valid: false, status: "ERROR", message: "Le catalogue Spotify n’a pas renvoyé de morceau vérifiable." };
    }
    return { valid: true, status: "ACTIVE", message: "Spotify : accès au catalogue vérifié." };
  } catch {
    return { valid: false, status: "ERROR", message: "Le catalogue Spotify est indisponible." };
  }
}
