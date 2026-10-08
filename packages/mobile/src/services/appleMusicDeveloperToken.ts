import { getSupabaseAccessToken, isSupabaseConfigured } from "./supabaseClient";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Jeton MusicKit/ShazamKit signé côté serveur, jamais une clé privée dans l'application.
 * Le module Shazam natif actuel est iOS uniquement : ce client prépare le jeton,
 * mais n'ajoute pas le SDK ShazamKit Android absent de ce dépôt.
 */
export async function getAppleMusicDeveloperToken(): Promise<string> {
  if (!isSupabaseConfigured || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Apple Music : configuration Supabase indisponible.");
  }
  const accessToken = await getSupabaseAccessToken();
  if (!accessToken) throw new Error("Apple Music : connecte-toi avant de récupérer le jeton développeur.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/keep-apple-music-token`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: ["Bearer", accessToken].join(" "),
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) throw new Error("apple_music_token_unavailable");
    const body = await response.json();
    if (typeof body?.token !== "string" || !body.token.trim() ||
        !Number.isFinite(body?.expiresAt) || body.expiresAt <= Math.floor(Date.now() / 1000)) {
      throw new Error("apple_music_token_invalid");
    }
    return body.token;
  } catch {
    throw new Error("Apple Music : jeton développeur indisponible. Réessaie après connexion.");
  } finally {
    clearTimeout(timer);
  }
}
