import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Adel (20/09/2026) : relais ChatGPT <-> Claude Code. Voir AI/AI_bridge.md.
// Garde-fou strict : accès limité à ce projet Supabase, aucune commande
// shell (ce fichier ne fait jamais que lire/écrire ai_relay_messages ou
// lire un fichier public GitHub), clé uniquement dans integration_secrets
// (jamais dans Git). Anti-doublon + limites de taille/fréquence : voir
// service_ai_relay_post (migration 20260920130000).

const DEPLOY_SHA = "dec58bfb89761e3f0656dc809f3565aa54fe7920";
const REPORT_RAW_URL = "https://raw.githubusercontent.com/adelkhatra-bit/KEEP/reconcile/claude-main-20260825/AI/AI_REPORT.md";
const MAX_TEXT_LENGTH = 4000;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-relay-key, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers });

async function integrationSecret(key: string): Promise<string> {
  const { data, error } = await admin.rpc("service_get_integration_secret", { p_key: key });
  if (!error && typeof data === "string" && data.trim()) return data.trim();
  return "";
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });

  const url = new URL(req.url);
  const opParam = url.searchParams.get("op");

  // Essai sans modification, sans clé : confirme que le relais est en
  // ligne (aucune lecture/écriture de données, aucun secret impliqué).
  if (req.method === "GET" && opParam === "ping") {
    return json(200, { ok: true, service: "keep-ai-relay", sha: DEPLOY_SHA });
  }

  try {
    const expectedKey = await integrationSecret("AI_RELAY_API_KEY");
    if (!expectedKey) return json(503, { error: "relay_not_configured" });

    const providedKey = (req.headers.get("x-relay-key") ?? "").trim();
    if (!providedKey || !timingSafeEqual(providedKey, expectedKey)) {
      console.log(`[keep-ai-relay] rejected: unauthorized (${req.method} op=${opParam ?? ""})`);
      return json(401, { error: "unauthorized" });
    }

    const op = (opParam ?? (await req.json().catch(() => ({})))?.op ?? "").toString();

    if (req.method === "GET" && (op === "state" || !op)) {
      const [{ data: instructions }, reportText] = await Promise.all([
        admin.rpc("service_ai_relay_list", { p_channel: "instruction", p_limit: 10 }),
        fetch(`${REPORT_RAW_URL}?ts=${Date.now()}`).then((r) => (r.ok ? r.text() : "")).catch(() => ""),
      ]);
      console.log("[keep-ai-relay] state read ok");
      return json(200, {
        ok: true,
        latestReport: reportText || null,
        reportSource: REPORT_RAW_URL,
        recentInstructions: instructions ?? [],
      });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const action = String(body?.op ?? op ?? "instruct");
      const text = String(body?.text ?? "").trim();
      if (!text) return json(400, { error: "text_required" });
      if (text.length > MAX_TEXT_LENGTH) {
        console.log(`[keep-ai-relay] rejected: body_too_long (${text.length} chars)`);
        return json(413, { error: "body_too_long", limit: MAX_TEXT_LENGTH });
      }

      if (action === "instruct") {
        const { data, error } = await admin.rpc("service_ai_relay_post", {
          p_channel: "instruction",
          p_author: "chatgpt",
          p_body: text,
        });
        if (error) {
          if (error.message?.includes("rate_limited")) {
            console.log("[keep-ai-relay] rejected: rate_limited");
            return json(429, { error: "rate_limited" });
          }
          throw error;
        }
        console.log(`[keep-ai-relay] instruction accepted id=${data} length=${text.length}`);
        return json(200, { ok: true, id: data });
      }

      return json(400, { error: "unknown_op" });
    }

    return json(405, { error: "method_not_allowed" });
  } catch (error) {
    console.error("[keep-ai-relay]", error);
    return json(500, { error: error instanceof Error ? error.message : String(error) });
  }
});
