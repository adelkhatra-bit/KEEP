import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isRealMusicUser, MusicLinkError, readBoundedJson, resolveMusicLink } from "./resolver.ts";
import { createMusicLinkStore } from "./store.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", {
  auth: { persistSession: false, autoRefreshToken: false },
});
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  try {
    const authorization = request.headers.get("authorization") || "";
    const [scheme, token, ...extra] = authorization.trim().split(/\s+/);
    if (scheme.toLowerCase() !== "bearer" || !token || extra.length) return json(401, { error: "real_account_required" });
    const { data, error } = await admin.auth.getUser(token);
    const user = data?.user;
    // Demo/guest clients cannot authorize writes or consume the resolver API.
    if (error || !user || !isRealMusicUser(user)) {
      return json(401, { error: "real_account_required" });
    }
    const body = await readBoundedJson(new Response(request.body, { headers: request.headers }), 4096);
    if (body?.demo === true) return json(403, { error: "demo_import_forbidden" });
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`music-link:${user.id}`));
    const identity = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    const { data: allowed, error: limitError } = await admin.rpc("service_allow_recognition", {
      p_identity_hash: identity, p_limit: 10, p_window_seconds: 60,
    });
    if (limitError) return json(503, { error: "music_import_unavailable" });
    if (!allowed) return json(429, { error: "rate_limited" });
    return json(200, await resolveMusicLink(body, user.id, createMusicLinkStore(admin)));
  } catch (error) {
    if (error instanceof MusicLinkError) return json(error.status, { error: error.code });
    return json(500, { error: "music_import_unavailable" });
  }
});
