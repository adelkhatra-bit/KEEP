export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_URL_LENGTH = 2048;
const MAX_RESPONSE_BYTES = 512 * 1024;

export type ResolvedTrack = {
  id?: string;
  title: string;
  artist: string;
  isrc?: string;
  artworkUrl?: string;
  genres?: string[];
  platformLinks: Record<string, string>;
};

export class MusicLinkError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

const HOSTS: Record<string, string[]> = {
  youtube: ["youtu.be", "youtube.com", "www.youtube.com", "m.youtube.com"],
  youtube_music: ["music.youtube.com"],
  spotify: ["open.spotify.com", "spotify.link", "spoti.fi"],
  apple_music: ["music.apple.com", "itunes.apple.com"],
  deezer: ["deezer.com", "www.deezer.com", "deezer.page.link", "link.deezer.com"],
  soundcloud: ["soundcloud.com", "www.soundcloud.com", "on.soundcloud.com"],
  tiktok: ["tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"],
  shazam: ["shazam.com", "www.shazam.com"],
  amazon_music: ["music.amazon.com", "music.amazon.fr", "music.amazon.co.uk", "music.amazon.de", "music.amazon.co.jp", "music.amazon.ca", "music.amazon.it", "music.amazon.es", "music.amazon.com.au", "music.amazon.in", "music.amazon.com.br"],
  tidal: ["tidal.com", "www.tidal.com", "listen.tidal.com"],
  other: ["song.link", "album.link", "odesli.co"],
};

const PLATFORM_PROVIDERS: Record<string, string> = {
  youtube: "youtube",
  youtubeMusic: "youtube_music",
  spotify: "spotify",
  appleMusic: "apple_music",
  itunes: "apple_music",
  deezer: "deezer",
  soundcloud: "soundcloud",
  tiktok: "tiktok",
  shazam: "shazam",
  amazonMusic: "amazon_music",
  amazonStore: "amazon_music",
  tidal: "tidal",
};
const EXTRA_PLATFORMS: Record<string, string[]> = {
  pandora: ["pandora.com", "www.pandora.com"],
  napster: ["napster.com", "www.napster.com", "play.napster.com"],
  yandex: ["music.yandex.ru", "music.yandex.com"],
  audius: ["audius.co"],
  anghami: ["play.anghami.com", "anghami.com"],
  boomplay: ["boomplay.com", "www.boomplay.com"],
  bandcamp: ["bandcamp.com"],
  saavn: ["jiosaavn.com", "www.jiosaavn.com"],
  audiomack: ["audiomack.com", "www.audiomack.com"],
  qobuz: ["open.qobuz.com", "play.qobuz.com", "www.qobuz.com"],
};

function extraPlatform(host: string): string | undefined {
  return Object.keys(EXTRA_PLATFORMS).find((key) => EXTRA_PLATFORMS[key].includes(host)
    || (key === "bandcamp" && host.endsWith(".bandcamp.com")));
}

export function parseMusicUrl(value: unknown): { url: string; provider: string } {
  if (typeof value !== "string" || value.length > MAX_URL_LENGTH || /[\u0000-\u0020\\]/.test(value)) {
    throw new MusicLinkError(400, "invalid_music_url");
  }
  let url: URL;
  try { url = new URL(value); } catch { throw new MusicLinkError(400, "invalid_music_url"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new MusicLinkError(400, "invalid_music_url");
  }
  const provider = Object.keys(HOSTS).find((key) => HOSTS[key].includes(url.hostname))
    || (extraPlatform(url.hostname) ? "other" : undefined);
  if (!provider) throw new MusicLinkError(400, "unsupported_music_host");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|si$|feature$|fbclid$)/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return { url: url.toString(), provider };
}

function text(value: unknown, limit = 300): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

export function normalizeIdentity(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function artwork(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > MAX_URL_LENGTH) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return undefined;
    const hosts = ["scdn.co", "mzstatic.com", "dzcdn.net", "ytimg.com", "sndcdn.com", "tidal.com"];
    if (!hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return undefined;
    return url.toString();
  } catch { return undefined; }
}

export function parseOdesli(payload: any, input: { url: string; provider: string }) {
  const entities = payload?.entitiesByUniqueId;
  if (!entities || typeof entities !== "object" || Array.isArray(entities)) {
    throw new MusicLinkError(502, "invalid_provider_response");
  }
  const entity = entities[payload.entityUniqueId];
  if (!entity || entity.type !== "song" || !text(entity.title) || !text(entity.artistName)) {
    throw new MusicLinkError(422, "music_track_not_found");
  }
  const platformLinks: Record<string, string> = {};
  const providerIds: Record<string, string> = {};
  let providerTrackId = "";
  let isrc: string | undefined;
  for (const [platform, link] of Object.entries(payload.linksByPlatform || {}) as [string, any][]) {
    try {
      const parsed = parseMusicUrl(link?.url);
      if (EXTRA_PLATFORMS[platform]) {
        if (extraPlatform(new URL(parsed.url).hostname) !== platform) continue;
      } else if (PLATFORM_PROVIDERS[platform] !== parsed.provider) continue;
      platformLinks[platform] = parsed.url;
      const linked = entities[link.entityUniqueId];
      const id = linked?.type === "song" ? text(linked.id, 200) : "";
      if (id) providerIds[platform] = id;
      if (parsed.provider === input.provider && id) providerTrackId = id;
    } catch { /* Untrusted provider links are never returned to the client. */ }
  }
  for (const candidate of [entity, ...Object.values(entities)] as any[]) {
    const candidateIsrc = text(candidate?.isrc, 20).replace(/-/g, "").toUpperCase();
    if (candidate?.type === "song" && /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(candidateIsrc)) {
      isrc = candidateIsrc;
      break;
    }
  }
  // Preserve the submitted platform, including TikTok/Shazam short links.
  if (!Object.values(platformLinks).includes(input.url)) platformLinks[input.provider] = input.url;
  const track: ResolvedTrack = {
    title: text(entity.title), artist: text(entity.artistName), platformLinks,
    ...(isrc ? { isrc } : {}),
    ...(artwork(entity.thumbnailUrl) ? { artworkUrl: artwork(entity.thumbnailUrl) } : {}),
    genres: Array.isArray(entity.genres) ? entity.genres.map((g: unknown) => text(g, 80)).filter(Boolean).slice(0, 20) : [],
  };
  return { track, providerIds, providerTrackId: providerTrackId || (isrc ? `isrc:${isrc}` : input.url) };
}

export async function readBoundedJson(response: Response, maxBytes: number): Promise<any> {
  if (Number(response.headers.get("content-length")) > maxBytes) throw new MusicLinkError(413, "payload_too_large");
  if (!response.body) throw new MusicLinkError(400, "invalid_json");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new MusicLinkError(413, "payload_too_large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new MusicLinkError(400, "invalid_json"); }
}

export async function fetchOdesli(input: { url: string; provider: string }, fetcher: typeof fetch = fetch) {
  const query = new URLSearchParams({ url: input.url });
  try {
    const response = await fetcher(`https://api.song.link/v1-alpha.1/links?${query}`, {
      redirect: "error", signal: AbortSignal.timeout(15000), headers: { accept: "application/json" },
    });
    if (response.status === 429) throw new MusicLinkError(429, "provider_rate_limited");
    if (!response.ok) throw new MusicLinkError(502, "music_provider_unavailable");
    return parseOdesli(await readBoundedJson(response, MAX_RESPONSE_BYTES), input);
  } catch (error) {
    if (error instanceof MusicLinkError) throw error;
    throw new MusicLinkError(502, "music_provider_unavailable");
  }
}

export type Resolution = ReturnType<typeof parseOdesli>;
export function sanitizeCachedResolution(value: any, input: { url: string; provider: string }): Resolution | null {
  if (!value?.track || typeof value.track !== "object" || !text(value.track.title) || !text(value.track.artist)) return null;
  const entities: Record<string, any> = {
    cached: { type: "song", title: value.track.title, artistName: value.track.artist, isrc: value.track.isrc,
      thumbnailUrl: value.track.artworkUrl, genres: value.track.genres },
  };
  const links: Record<string, any> = {};
  for (const [key, url] of Object.entries(value.track.platformLinks || {})) {
    if (!PLATFORM_PROVIDERS[key] && !EXTRA_PLATFORMS[key]) continue;
    entities[key] = { type: "song", id: text(value.providerIds?.[key], 200) };
    links[key] = { url, entityUniqueId: key };
  }
  const safe = parseOdesli({ entityUniqueId: "cached", entitiesByUniqueId: entities, linksByPlatform: links }, input);
  const id = text(value.providerTrackId, MAX_URL_LENGTH);
  if (!id || /[\u0000-\u001f]/.test(id)) return null;
  return { ...safe, providerTrackId: id };
}

export function isRealMusicUser(user: any): boolean {
  return Boolean(user?.id && !user.is_anonymous && user.user_metadata?.is_demo !== true && user.app_metadata?.is_demo !== true);
}

export interface MusicLinkStore {
  cached(profileId: string, input: { url: string; provider: string }): Promise<Resolution | null>;
  import(profileId: string, input: { url: string; provider: string }, resolution: Resolution): Promise<{ id: string; alreadyImported: boolean }>;
}

export async function resolveMusicLink(
  body: any, profileId: string, store: MusicLinkStore, fetcher: typeof fetch = fetch,
) {
  if (!body || (body.mode !== undefined && body.mode !== "preview" && body.mode !== "import")
    || (body.preview !== undefined && typeof body.preview !== "boolean")
    || (body.preview === true && body.mode === "import")) {
    throw new MusicLinkError(400, "invalid_mode");
  }
  const input = parseMusicUrl(body.url);
  const resolution = await store.cached(profileId, input) || await fetchOdesli(input, fetcher);
  if (body.mode === "preview" || body.preview === true) return { track: { ...resolution.track, id: undefined } };
  const imported = await store.import(profileId, input, resolution);
  return { track: { ...resolution.track, id: imported.id }, imported: !imported.alreadyImported, alreadyImported: imported.alreadyImported };
}
