import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

const FETCHABLE_HOSTS = [
  "youtube.com", "youtu.be", "tiktok.com", "instagram.com", "snapchat.com", "snap.com",
  "facebook.com", "fb.watch", "open.spotify.com", "music.apple.com", "deezer.com", "soundcloud.com",
];

function hostAllowed(host: string) {
  const clean = host.toLowerCase().replace(/^www\./, "");
  return FETCHABLE_HOSTS.some((allowed) => clean === allowed || clean.endsWith(`.${allowed}`));
}

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/&amp;/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

function cleanMusicText(value: unknown) {
  return String(value ?? "")
    .replace(/&amp;/gi, "&")
    .replace(/\s*[\[(](official\s*(music\s*)?video|official\s*audio|lyrics?|lyric\s*video|visuali[sz]er|audio|clip officiel|music video)[^\])]*[\])]/gi, "")
    .replace(/\s*[-–—|]\s*(youtube|tiktok|instagram|spotify|apple music)\s*$/i, "")
    .replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string) {
  return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function metaContent(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return "";
}

function titleTag(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? decodeHtml(match[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() : "";
}

function parseArtistTitle(text: string) {
  const clean = cleanMusicText(text);
  if (!clean) return null;
  const by = clean.match(/^(.{2,120}?)\s+by\s+(.{2,100})$/i);
  if (by) return { title: by[1].trim(), artist: by[2].trim() };
  for (const sep of [" - ", " – ", " — ", " | "]) {
    const parts = clean.split(sep).map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2 && parts[0].length <= 100 && parts[1].length <= 140) {
      return { artist: parts[0], title: parts[1] };
    }
  }
  return null;
}

function tokens(value: string) {
  const stop = new Set(["official", "video", "audio", "lyrics", "lyric", "music", "youtube", "tiktok", "instagram", "spotify", "apple", "the", "a", "an", "feat", "ft"]);
  return normalize(value).split(" ").filter((token) => token.length > 1 && !stop.has(token));
}

function overlapScore(haystack: string, needle: string) {
  const a = new Set(tokens(haystack));
  const b = tokens(needle);
  if (!b.length) return 0;
  let hits = 0;
  for (const token of b) if (a.has(token)) hits += 1;
  return hits / b.length;
}

async function fetchJson(url: string) {
  try {
    const response = await fetch(url, { headers: { "User-Agent": "KEEP/1.0" }, signal: AbortSignal.timeout(4500) });
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch {
    return null;
  }
}

async function fetchPublicMetadata(sourceUrl: URL) {
  const host = sourceUrl.hostname.toLowerCase();
  const texts: string[] = [];
  let author = "";

  if (host.includes("youtube.com") || host === "youtu.be") {
    const data = await fetchJson(`https://www.youtube.com/oembed?url=${encodeURIComponent(sourceUrl.toString())}&format=json`);
    if (data?.title) texts.push(String(data.title));
    if (data?.author_name) author = String(data.author_name);
  } else if (host.includes("tiktok.com")) {
    const data = await fetchJson(`https://www.tiktok.com/oembed?url=${encodeURIComponent(sourceUrl.toString())}`);
    if (data?.title) texts.push(String(data.title));
    if (data?.author_name) author = String(data.author_name);
  }

  if (hostAllowed(host)) {
    try {
      const response = await fetch(sourceUrl.toString(), {
        headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 KEEP/1.0" },
        redirect: "follow",
        signal: AbortSignal.timeout(5000),
      });
      const type = response.headers.get("content-type") || "";
      if (response.ok && /text\/html/i.test(type)) {
        const html = (await response.text()).slice(0, 700000);
        for (const key of ["og:title", "twitter:title", "og:description", "twitter:description", "music:song", "music:musician"]) {
          const value = metaContent(html, key);
          if (value) texts.push(value);
        }
        const title = titleTag(html);
        if (title) texts.push(title);
      }
    } catch {
      // Les réseaux peuvent refuser le fetch serveur ; oEmbed/texte partagé reste utilisé.
    }
  }

  return { texts: Array.from(new Set(texts.map(cleanMusicText).filter(Boolean))).slice(0, 10), author: cleanMusicText(author) };
}

async function appleLookup(trackId: string) {
  const payload = await fetchJson(`https://itunes.apple.com/lookup?id=${encodeURIComponent(trackId)}&entity=song&country=FR`);
  const row = Array.isArray(payload?.results) ? payload.results.find((item: any) => item?.wrapperType === "track") : null;
  return row ?? null;
}

async function appleSearch(term: string) {
  if (!term.trim()) return [];
  const payload = await fetchJson(`https://itunes.apple.com/search?term=${encodeURIComponent(term.slice(0, 220))}&entity=song&limit=25&country=FR`);
  return Array.isArray(payload?.results) ? payload.results : [];
}

function normalizedRecognition(row: any, confidence: number, sourceUrl: string) {
  if (!row?.trackName || !row?.artistName) return null;
  const artwork = String(row.artworkUrl100 || "").replace(/100x100bb/gi, "600x600bb").replace(/100x100/gi, "600x600");
  const trackId = row.trackId ? String(row.trackId) : `${normalize(row.artistName)}|${normalize(row.trackName)}`;
  return {
    confidence: Math.max(0.55, Math.min(0.94, confidence)),
    title: String(row.trackName),
    artist: String(row.artistName),
    album: row.collectionName ? String(row.collectionName) : undefined,
    artworkUrl: artwork || undefined,
    previewUrl: row.previewUrl ? String(row.previewUrl) : undefined,
    availableOn: ["Apple Music"],
    externalUrls: {
      appleMusic: row.trackViewUrl ? String(row.trackViewUrl) : undefined,
      youtubeSearch: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${row.artistName} ${row.trackName}`)}`,
      source: sourceUrl,
    },
    providerIds: row.trackId ? { appleMusic: String(row.trackId) } : {},
    recognitionProviderTrackId: `keyless:${trackId}`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const body = await req.json().catch(() => ({}));
    const rawUrl = String(body?.url ?? "").trim();
    const rawText = cleanMusicText(body?.rawText ?? "");
    const suppliedTitle = cleanMusicText(body?.title ?? "");
    if (!rawUrl && !rawText && !suppliedTitle) return json(200, { ok: true, provider: "KEYLESS_SOURCE", recognition: null });

    let sourceUrl: URL | null = null;
    if (rawUrl) {
      try {
        sourceUrl = new URL(rawUrl);
        if (!/^https?:$/.test(sourceUrl.protocol)) sourceUrl = null;
      } catch {
        sourceUrl = null;
      }
    }

    if (sourceUrl?.hostname.includes("music.apple.com")) {
      const directId = sourceUrl.searchParams.get("i");
      if (directId && /^\d+$/.test(directId)) {
        const row = await appleLookup(directId);
        if (row) return json(200, { ok: true, provider: "KEYLESS_SOURCE", strategy: "apple-direct", recognition: normalizedRecognition(row, 0.94, sourceUrl.toString()) });
      }
    }

    const meta = sourceUrl ? await fetchPublicMetadata(sourceUrl) : { texts: [], author: "" };
    const contexts = Array.from(new Set([suppliedTitle, rawText, ...meta.texts].filter(Boolean))).slice(0, 12);
    const parsed = contexts.map(parseArtistTitle).find(Boolean) as { artist: string; title: string } | undefined;

    const queries: string[] = [];
    if (parsed) queries.push(`${parsed.artist} ${parsed.title}`);
    for (const text of contexts) queries.push(text);
    if (meta.author && contexts[0]) queries.push(`${meta.author} ${contexts[0]}`);

    let best: { row: any; score: number } | null = null;
    for (const query of Array.from(new Set(queries)).slice(0, 5)) {
      const rows = await appleSearch(query);
      for (const row of rows) {
        const combined = `${row?.artistName ?? ""} ${row?.trackName ?? ""} ${row?.collectionName ?? ""}`;
        let score = Math.max(...contexts.map((ctx) => overlapScore(ctx, combined)), 0);
        if (parsed) {
          const artist = overlapScore(String(row?.artistName ?? ""), parsed.artist);
          const title = overlapScore(String(row?.trackName ?? ""), parsed.title);
          score = Math.max(score, artist * 0.45 + title * 0.55);
        }
        if (!best || score > best.score) best = { row, score };
      }
      if (best?.score && best.score >= 0.82) break;
    }

    if (!best || best.score < 0.58) {
      return json(200, { ok: true, provider: "KEYLESS_SOURCE", strategy: "public-metadata", recognition: null });
    }

    return json(200, {
      ok: true,
      provider: "KEYLESS_SOURCE",
      strategy: parsed ? "artist-title+itunes" : "metadata+itunes",
      recognition: normalizedRecognition(best.row, 0.58 + Math.min(0.34, best.score * 0.36), sourceUrl?.toString() || rawUrl),
    });
  } catch (error) {
    return json(200, { ok: true, provider: "KEYLESS_SOURCE", recognition: null, diagnostic: error instanceof Error ? error.message.slice(0, 180) : "keyless_error" });
  }
});
