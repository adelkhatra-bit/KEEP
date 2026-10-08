import { getAppleMusicDeveloperToken, getSpotifyAccessToken, type IntegrationSecretClient } from "./musicProviderCredentials.ts";

export type ProviderCatalogTrack = {
  source: "apple" | "spotify" | "deezer";
  id: string;
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  previewUrl?: string;
  externalUrl?: string;
  isrc?: string;
  genres?: string[];
  releaseYear?: number;
};

function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try { return new URL(value).protocol === "https:" ? value : undefined; }
  catch { return undefined; }
}

export function appleMusicCatalogTrack(row: any): ProviderCatalogTrack | null {
  const attributes = row?.attributes;
  if (!row?.id || !attributes?.name || !attributes?.artistName) return null;
  return {
    source: "apple", id: String(row.id), title: String(attributes.name), artist: String(attributes.artistName),
    album: attributes.albumName || undefined,
    artworkUrl: httpsUrl(attributes.artwork?.url?.replace(/\{w\}|\{h\}/g, "600").replace(/\{f\}/g, "jpg")),
    previewUrl: httpsUrl(attributes.previews?.[0]?.url),
    externalUrl: httpsUrl(attributes.url),
    isrc: typeof attributes.isrc === "string" ? attributes.isrc : undefined,
    genres: Array.isArray(attributes.genreNames) ? attributes.genreNames.filter((genre: unknown) => typeof genre === "string") : [],
    releaseYear: /^\d{4}/.test(attributes.releaseDate ?? "") ? Number(attributes.releaseDate.slice(0, 4)) : undefined,
  };
}

export function spotifyCatalogTrack(row: any): ProviderCatalogTrack | null {
  if (!row?.id || !row?.name || !row?.artists?.[0]?.name) return null;
  return {
    source: "spotify", id: String(row.id), title: String(row.name), artist: String(row.artists[0].name),
    album: row.album?.name || undefined,
    artworkUrl: httpsUrl(row.album?.images?.[0]?.url),
    previewUrl: httpsUrl(row.preview_url),
    externalUrl: httpsUrl(row.external_urls?.spotify),
    isrc: typeof row.external_ids?.isrc === "string" ? row.external_ids.isrc : undefined,
    releaseYear: /^\d{4}/.test(row.album?.release_date ?? "") ? Number(row.album.release_date.slice(0, 4)) : undefined,
  };
}

async function providerJson(url: string, token: string): Promise<any> {
  const response = await fetch(url, {
    headers: { Authorization: "Bearer " + token },
    signal: AbortSignal.timeout(6500),
    redirect: "error",
  });
  if (!response.ok) return null;
  return response.json();
}

export async function searchAppleMusicCatalog(admin: IntegrationSecretClient, query: string, storefront = "fr"): Promise<ProviderCatalogTrack[]> {
  if (!query.trim() || !/^[a-z]{2}$/.test(storefront)) return [];
  try {
    const credentials = await getAppleMusicDeveloperToken(admin);
    if (!credentials) return [];
    const url = new URL(`https://api.music.apple.com/v1/catalog/${storefront}/search`);
    url.search = new URLSearchParams({ term: query.slice(0, 220), types: "songs", limit: "18" }).toString();
    const payload = await providerJson(url.toString(), credentials.token);
    return (Array.isArray(payload?.results?.songs?.data) ? payload.results.songs.data : [])
      .flatMap((row: any) => { const track = appleMusicCatalogTrack(row); return track ? [track] : []; });
  } catch { return []; }
}

export async function lookupAppleMusicCatalog(admin: IntegrationSecretClient, id: string, storefront = "fr"): Promise<ProviderCatalogTrack | null> {
  if (!/^\d+$/.test(id) || !/^[a-z]{2}$/.test(storefront)) return null;
  try {
    const credentials = await getAppleMusicDeveloperToken(admin);
    if (!credentials) return null;
    const payload = await providerJson(`https://api.music.apple.com/v1/catalog/${storefront}/songs/${id}`, credentials.token);
    return appleMusicCatalogTrack(payload?.data?.[0]);
  } catch { return null; }
}

export async function searchSpotifyCatalog(admin: IntegrationSecretClient, query: string, market = "FR"): Promise<ProviderCatalogTrack[]> {
  if (!query.trim() || !/^[A-Z]{2}$/.test(market)) return [];
  try {
    const credentials = await getSpotifyAccessToken(admin);
    if (!credentials) return [];
    const url = new URL("https://api.spotify.com/v1/search");
    url.search = new URLSearchParams({ q: query.slice(0, 220), type: "track", market, limit: "18" }).toString();
    const payload = await providerJson(url.toString(), credentials.token);
    return (Array.isArray(payload?.tracks?.items) ? payload.tracks.items : [])
      .flatMap((row: any) => { const track = spotifyCatalogTrack(row); return track ? [track] : []; });
  } catch { return []; }
}

export async function lookupSpotifyCatalog(admin: IntegrationSecretClient, id: string, market = "FR"): Promise<ProviderCatalogTrack | null> {
  if (!/^[A-Za-z0-9]{22}$/.test(id) || !/^[A-Z]{2}$/.test(market)) return null;
  try {
    const credentials = await getSpotifyAccessToken(admin);
    if (!credentials) return null;
    const payload = await providerJson(`https://api.spotify.com/v1/tracks/${id}?market=${market}`, credentials.token);
    return spotifyCatalogTrack(payload);
  } catch { return null; }
}
