import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-keep-cron-key",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function out(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function authorized(req: Request) {
  const supplied = req.headers.get("x-keep-cron-key") || "";
  if (!supplied) return false;
  const { data, error } = await admin
    .from("keep_internal_worker_secrets")
    .select("secret_hash")
    .eq("name", "world-catalog-cron")
    .maybeSingle();
  if (error || !data?.secret_hash) return false;
  return (await sha256(supplied)) === String(data.secret_hash);
}

function artwork(url: string) {
  return url.replace(/100x100bb/gi, "600x600bb").replace(/100x100/gi, "600x600");
}

function year(value: unknown): number | null {
  const match = String(value ?? "").match(/^(19|20)\d{2}/);
  return match ? Number(match[0]) : null;
}

function normalizeCountry(value: unknown) {
  const code = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : "US";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return out(405, { ok: false, error: "method_not_allowed" });
  if (!(await authorized(req))) return out(401, { ok: false, error: "unauthorized" });

  const url = new URL(req.url);
  const targetId = Number(url.searchParams.get("target") || 0);
  if (!Number.isSafeInteger(targetId) || targetId <= 0) return out(400, { ok: false, error: "target_required" });

  const { data: target, error: targetError } = await admin
    .from("keep_world_catalog_expansion_queue")
    .select("id,query,country_code,status")
    .eq("id", targetId)
    .maybeSingle();

  if (targetError || !target) return out(404, { ok: false, error: "target_not_found" });
  if (!["PROCESSING", "PENDING", "RETRY"].includes(String(target.status))) {
    return out(200, { ok: true, skipped: true, status: target.status });
  }

  try {
    const query = String(target.query || "").trim();
    if (!query) throw new Error("empty_query");
    const country = normalizeCountry(target.country_code);

    const params = new URLSearchParams({
      term: query,
      media: "music",
      entity: "song",
      limit: "200",
      country,
    });

    const response = await fetch(`https://itunes.apple.com/search?${params.toString()}`, {
      headers: { "user-agent": "KEEP/1.0 World Catalog" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`provider_http_${response.status}`);

    const payload = await response.json().catch(() => null);
    const rows = Array.isArray(payload?.results) ? payload.results : [];

    const seen = new Set<string>();
    const items: any[] = [];
    for (const row of rows) {
      const title = String(row?.trackName ?? "").trim();
      const artist = String(row?.artistName ?? "").trim();
      const previewUrl = String(row?.previewUrl ?? "").trim();
      const trackId = String(row?.trackId ?? "").trim();
      if (!title || !artist || !trackId) continue;
      if (!previewUrl.startsWith("https://")) continue;
      const key = `${trackId}:${title.toLowerCase()}:${artist.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const genre = String(row?.primaryGenreName ?? "").trim();
      const trackUrl = String(row?.trackViewUrl ?? "").trim();
      items.push({
        title,
        artist,
        album: String(row?.collectionName ?? "").trim() || null,
        artworkUrl: row?.artworkUrl100 ? artwork(String(row.artworkUrl100)) : null,
        previewUrl,
        releaseYear: year(row?.releaseDate),
        providerIds: { appleMusic: trackId, itunes: trackId },
        externalUrls: trackUrl ? { appleMusic: trackUrl, itunes: trackUrl } : {},
        availableOn: ["appleMusic"],
        genres: genre ? [genre] : [],
      });
    }

    const { data: ingest, error: ingestError } = await admin.rpc("service_world_catalog_ingest", { p_items: items });
    if (ingestError) throw ingestError;

    await admin.rpc("service_world_catalog_finish", {
      p_id: targetId,
      p_ok: true,
      p_result_count: items.length,
      p_error: null,
    });

    return out(200, {
      ok: true,
      target: targetId,
      query,
      country,
      providerResults: rows.length,
      acceptedRows: items.length,
      ingest,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await admin.rpc("service_world_catalog_finish", {
        p_id: targetId,
        p_ok: false,
        p_result_count: 0,
        p_error: message,
      });
    } catch {
      // The original provider/ingest error is the useful result; queue recovery
      // also reclaims stale PROCESSING rows after twenty minutes.
    }
    return out(502, { ok: false, target: targetId, error: message });
  }
});
