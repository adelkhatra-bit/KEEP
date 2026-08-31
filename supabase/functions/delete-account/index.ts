import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE) {
    return json(500, { error: "server_not_configured" });
  }

  const authorization = req.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { error: "authentication_required" });

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return json(401, { error: "invalid_session" });

  // Le bucket utilise `${profileId}/avatar.ext`. On efface d'abord tous les
  // objets du dossier, puis auth.users. profiles.id référence auth.users avec
  // ON DELETE CASCADE, et les données KEEP liées au profil sont elles-mêmes
  // protégées par des cascades/SET NULL vérifiées dans le schéma production.
  try {
    const { data: files } = await admin.storage.from("avatars").list(user.id, { limit: 100 });
    const paths = (files ?? []).map((file) => `${user.id}/${file.name}`).filter(Boolean);
    if (paths.length) await admin.storage.from("avatars").remove(paths);
  } catch {
    // Un ancien avatar manquant ne doit pas empêcher la suppression du compte.
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("delete-account", user.id, deleteError.message);
    return json(500, { error: "account_deletion_failed", message: "Impossible de supprimer le compte pour le moment." });
  }

  return json(200, { ok: true });
});
