import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type Actor = { id: string; role: string };

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
}

async function requireAdmin(req: Request): Promise<Actor> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("unauthorized");
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) throw new Error("unauthorized");
  const { data: role, error: roleError } = await admin
    .from("admin_users")
    .select("id,role,is_active")
    .eq("id", userData.user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (roleError || !role) throw new Error("admin_required");
  return { id: userData.user.id, role: String(role.role) };
}

async function readPolicy() {
  const { data, error } = await admin
    .from("remote_config")
    .select("value,updated_at")
    .eq("key", "auth_require_verified_email")
    .maybeSingle();
  if (error) throw error;
  return {
    enabled: data?.value === true || data?.value === "true",
    updatedAt: data?.updated_at ?? null,
  };
}

async function accountStats() {
  let total = 0;
  let verified = 0;
  let unverified = 0;
  let withoutRealEmail = 0;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const user of data.users) {
      total += 1;
      const email = (user.email ?? "").trim().toLowerCase();
      if (!email || email.endsWith("@keep.local")) withoutRealEmail += 1;
      else if (user.email_confirmed_at) verified += 1;
      else unverified += 1;
    }
    if (data.users.length < 200) break;
  }
  return { total, verified, unverified, withoutRealEmail };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const actor = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "get");

    if (action === "get") {
      const [policy, stats] = await Promise.all([readPolicy(), accountStats()]);
      return json(200, { ok: true, ...policy, stats, canChange: ["SUPER_ADMIN", "ADMIN"].includes(actor.role) });
    }

    if (action === "set") {
      if (!["SUPER_ADMIN", "ADMIN"].includes(actor.role)) throw new Error("role_forbidden");
      const enabled = body?.enabled === true;
      const { error } = await admin.from("remote_config").upsert({
        key: "auth_require_verified_email",
        value: enabled,
        description: "Activation globale depuis le Super Admin : demande une adresse e-mail vérifiée aux comptes Loki existants sans supprimer ni recréer leur profil.",
        updated_at: new Date().toISOString(),
      }, { onConflict: "key" });
      if (error) throw error;

      await admin.from("audit_logs").insert({
        actor_admin_id: actor.id,
        action: enabled ? "auth.email_verification.enabled" : "auth.email_verification.disabled",
        target_type: "remote_config",
        target_id: null,
        before: null,
        after: { key: "auth_require_verified_email", enabled },
      });

      const stats = await accountStats();
      return json(200, { ok: true, enabled, updatedAt: new Date().toISOString(), stats, canChange: true });
    }

    return json(400, { error: "unknown_action" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "unauthorized" ? 401 : ["admin_required", "role_forbidden"].includes(message) ? 403 : 500;
    return json(status, { error: message });
  }
});
