import { getAppleMusicDeveloperToken, type IntegrationSecretClient } from "./musicProviderCredentials.ts";
import { appleMusicCatalogTrack } from "./musicProviderCatalog.ts";

export { getAppleMusicDeveloperToken } from "./musicProviderCredentials.ts";
export { searchAppleMusicCatalog, lookupAppleMusicCatalog } from "./musicProviderCatalog.ts";

export type MusicCredentialValidation = {
  valid: boolean;
  status: "ACTIVE" | "EXHAUSTED" | "ERROR" | "NOT_CONFIGURED";
  message: string;
};

export async function validateAppleMusicCredentials(
  teamId: string,
  keyId: string,
  pem: string,
): Promise<MusicCredentialValidation> {
  const credentials: Record<string, string> = {
    APPLE_MUSICKIT_TEAM_ID: String(teamId ?? "").trim(),
    APPLE_MUSICKIT_KEY_ID: String(keyId ?? "").trim(),
    APPLE_MUSICKIT_PRIVATE_KEY: String(pem ?? "").trim(),
  };
  if (Object.values(credentials).every((value) => !value)) {
    return { valid: false, status: "NOT_CONFIGURED", message: "Apple Music n’est pas configuré." };
  }
  if (Object.values(credentials).some((value) => !value)) {
    return { valid: false, status: "ERROR", message: "Les trois identifiants Apple Music sont requis." };
  }
  const client: IntegrationSecretClient = {
    rpc: async (_name, args) => ({ data: credentials[args.p_key] ?? null, error: null }),
  };
  try {
    const token = await getAppleMusicDeveloperToken(client);
    if (!token) return { valid: false, status: "ERROR", message: "La signature Apple Music est invalide." };
    const response = await fetch("https://api.music.apple.com/v1/catalog/fr/search?term=Daft%20Punk&types=songs&limit=1", {
      headers: { Authorization: "Bearer " + token.token },
      signal: AbortSignal.timeout(6500),
      redirect: "error",
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      if (response.status === 429) return { valid: false, status: "EXHAUSTED", message: "Le quota du catalogue Apple Music est temporairement atteint." };
      return { valid: false, status: "ERROR", message: "Le catalogue Apple Music refuse les identifiants ou est indisponible." };
    }
    const payload = await response.json();
    if (!Array.isArray(payload?.results?.songs?.data) || !payload.results.songs.data.some((row: unknown) => appleMusicCatalogTrack(row))) {
      return { valid: false, status: "ERROR", message: "Le catalogue Apple Music n’a pas renvoyé de morceau vérifiable." };
    }
    return { valid: true, status: "ACTIVE", message: "Apple Music : accès au catalogue vérifié." };
  } catch {
    return { valid: false, status: "ERROR", message: "Le catalogue Apple Music est indisponible." };
  }
}
