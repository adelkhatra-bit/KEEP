import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getAppleMusicDeveloperToken } from "../_shared/musicProviderCredentials.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const json = (status: number, payload: unknown) => new Response(JSON.stringify(payload), { status, headers });

export async function handleAppleMusicToken(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });
  try {
    const authorization = req.headers.get("authorization") ?? "";
    const token = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1];
    if (!token) return json(401, { ok: false, error: "authentication_required" });
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user || data.user.is_anonymous) return json(401, { ok: false, error: "authentication_required" });
    const credentials = await getAppleMusicDeveloperToken(admin);
    if (!credentials) return json(503, { ok: false, error: "apple_music_unavailable" });
    return json(200, { ok: true, token: credentials.token, expiresAt: credentials.expiresAt });
  } catch {
    return json(503, { ok: false, error: "apple_music_unavailable" });
  }
}

Deno.serve(handleAppleMusicToken);
