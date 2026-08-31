import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 12 || password.length > 128) {
      return json({ ok: false, error: "invalid_credentials" }, 400);
    }

    const { data: userId, error: consumeError } = await admin.rpc(
      "consume_admin_bootstrap_token",
      { p_email: email, p_password: password },
    );
    if (consumeError || !userId) return json({ ok: false, error: "invalid_or_expired" }, 401);

    const { error: updateError } = await admin.auth.admin.updateUserById(String(userId), {
      password,
      email_confirm: true,
    });
    if (updateError) {
      console.error("[keep-admin-bootstrap:update]", updateError);
      return json({ ok: false, error: "password_update_failed" }, 500);
    }
    return json({ ok: true });
  } catch (error) {
    console.error("[keep-admin-bootstrap]", error);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
