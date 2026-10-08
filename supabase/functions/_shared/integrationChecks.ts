import { ACTIVE_INTEGRATION_KEYS } from "./integrationUsage.ts";

type Probe = { valid: boolean; status?: string; message: string };
type Dependencies = {
  getSecret: (key: string) => Promise<string | null>;
  appleToken: () => Promise<string>;
  spotifyToken: () => Promise<string | null>;
  audd: (token: string) => Promise<Probe>;
  acrcloud: (host: string, key: string, secret: string) => Promise<Probe>;
};
export type IntegrationCheck = {
  key: string;
  status: "ACTIVE" | "ERROR" | "NOT_CONFIGURED";
  message: string;
  checkedAt: string;
};

export async function checkIntegrations(deps: Dependencies): Promise<IntegrationCheck[]> {
  const secrets = new Map(await Promise.all(ACTIVE_INTEGRATION_KEYS.map(async (key) => [key, await deps.getSecret(key)] as const)));
  const results = new Map<string, IntegrationCheck>();
  const checkedAt = new Date().toISOString();
  async function group(keys: (typeof ACTIVE_INTEGRATION_KEYS)[number][], probe: () => Promise<Probe>) {
    let status: IntegrationCheck["status"];
    let message: string;
    if (keys.some((key) => !secrets.get(key))) {
      status = "NOT_CONFIGURED";
      message = "Configuration fournisseur incomplète";
    } else {
      try {
        const result = await probe();
        status = result.valid && result.status !== "EXHAUSTED" ? "ACTIVE" : "ERROR";
        message = result.status === "EXHAUSTED" ? "Quota fournisseur épuisé" : result.message;
      } catch {
        status = "ERROR";
        message = "Connexion fournisseur impossible";
      }
    }
    for (const key of keys) {
      results.set(key, {
        key,
        status: !secrets.get(key) ? "NOT_CONFIGURED" : status === "NOT_CONFIGURED" ? "ERROR" : status,
        message,
        checkedAt,
      });
    }
  }
  async function http(url: string, init: RequestInit = {}): Promise<Probe> {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) });
    return { valid: response.ok, message: response.ok ? "Connexion fournisseur confirmée" : `Fournisseur HTTP ${response.status}` };
  }
  await Promise.all([
    group(["APPLE_MUSICKIT_TEAM_ID", "APPLE_MUSICKIT_KEY_ID", "APPLE_MUSICKIT_PRIVATE_KEY"], async () =>
      http("https://api.music.apple.com/v1/catalog/fr/search?term=Daft%20Punk&types=songs&limit=1", {
        headers: { Authorization: ["Bearer", await deps.appleToken()].join(" ") },
      })),
    group(["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"], async () => {
      const token = await deps.spotifyToken();
      if (!token) return { valid: false, message: "Identifiants Spotify refusés" };
      return http("https://api.spotify.com/v1/search?q=Daft%20Punk&type=track&limit=1&market=FR", {
        headers: { Authorization: ["Bearer", token].join(" ") },
      });
    }),
    group(["AUDD_API_KEY"], () => deps.audd(secrets.get("AUDD_API_KEY")!)),
    group(["ACRCLOUD_ACCESS_KEY", "ACRCLOUD_ACCESS_SECRET", "ACRCLOUD_HOST"], () =>
      deps.acrcloud(secrets.get("ACRCLOUD_HOST")!, secrets.get("ACRCLOUD_ACCESS_KEY")!, secrets.get("ACRCLOUD_ACCESS_SECRET")!)),
    group(["YOUTUBE_API_KEY"], () => http("https://www.googleapis.com/youtube/v3/videos?part=id&id=dQw4w9WgXcQ", {
      headers: { "X-Goog-Api-Key": secrets.get("YOUTUBE_API_KEY")! },
    })),
    group(["GOOGLE_TRANSLATE_API_KEY"], async () => {
      const response = await fetch("https://translation.googleapis.com/language/translate/v2", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": secrets.get("GOOGLE_TRANSLATE_API_KEY")! },
        body: JSON.stringify({ q: "Bonjour", target: "en", format: "text" }),
        signal: AbortSignal.timeout(10000),
      });
      const payload = await response.json().catch(() => null);
      return { valid: response.ok && typeof payload?.data?.translations?.[0]?.translatedText === "string", message: response.ok ? "Traduction fournisseur confirmée" : `Google HTTP ${response.status}` };
    }),
    group(["BREVO_API_KEY", "BREVO_SENDER_EMAIL", "BREVO_SENDER_NAME"], async () => {
      const response = await fetch("https://api.brevo.com/v3/senders", {
        headers: { "api-key": secrets.get("BREVO_API_KEY")! },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return { valid: false, message: `Brevo HTTP ${response.status}` };
      const payload = await response.json().catch(() => null);
      const sender = payload?.senders?.find((item: { email?: string; active?: boolean }) =>
        item.email?.toLowerCase() === secrets.get("BREVO_SENDER_EMAIL")!.toLowerCase() && item.active === true);
      return { valid: Boolean(sender), message: sender ? "Expéditeur Brevo confirmé" : "Expéditeur Brevo non vérifié" };
    }),
  ]);
  return ACTIVE_INTEGRATION_KEYS.map((key) => results.get(key)!);
}
