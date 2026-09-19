import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Adel (20/09/2026) : "monte un petit service securise cote equipe avec une
// API simple. Envoyer une instruction et recuperer ton dernier etat." --
// relais HTTP entre le connecteur ChatGPT (Custom GPT Action) et Claude
// Code. Voir AI/AI_bridge.md pour la doc complete et le mode d'emploi du
// connecteur, AI/AI_INSTRUCTIONS.md (miroir lisible des instructions) et
// AI/AI_REPORT.md (miroir lisible des rapports).
//
// Authentification : en-tete x-relay-key, comparee cote serveur a la valeur
// stockee dans integration_secrets (cle AI_RELAY_API_KEY), lue via le meme
// vault que Stripe/Brevo/Paddle. Cette cle n'est JAMAIS generee, lue ou
// saisie par une IA -- seul Adel la cree et la colle dans Super Admin puis
// dans la config du connecteur ChatGPT.
//
// Asymetrie volontaire des deux sens :
// - ChatGPT -> Claude (instructions) passe par cette fonction (ecrit dans
//   ai_relay_messages avec la service role key, jamais exposee) : c'est le
//   sens qui peut declencher une action, donc il reste cle-a-cle strict.
// - Claude -> ChatGPT (etat/rapport) n'a besoin d'aucun secret : le depot
//   est public, donc "op=state" relit simplement AI/AI_REPORT.md tel que
//   Claude vient de le committer/pousser (workflow git normal, deja utilise
//   pour AI_bridge.md toute la session). Claude Code n'a donc jamais besoin
//   de connaitre AI_RELAY_API_KEY.

const REPORT_RAW_URL = "https://raw.githubusercontent.com/adelkhatra-bit/KEEP/reconcile/claude-main-20260825/AI/AI_REPORT.md";

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

  try {
    const expectedKey = await integrationSecret("AI_RELAY_API_KEY");
    if (!expectedKey) return json(503, { error: "relay_not_configured", message: "AI_RELAY_API_KEY n'est pas encore configurée dans Super Admin." });

    const providedKey = (req.headers.get("x-relay-key") ?? "").trim();
    if (!providedKey || !timingSafeEqual(providedKey, expectedKey)) return json(401, { error: "unauthorized" });

    const url = new URL(req.url);
    const op = (url.searchParams.get("op") ?? (await req.json().catch(() => ({})))?.op ?? "").toString();

    if (req.method === "GET" && (op === "state" || !op)) {
      const [{ data: instructions }, reportText] = await Promise.all([
        admin.rpc("service_ai_relay_list", { p_channel: "instruction", p_limit: 10 }),
        fetch(`${REPORT_RAW_URL}?ts=${Date.now()}`).then((r) => (r.ok ? r.text() : "")).catch(() => ""),
      ]);
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

      if (action === "instruct") {
        const { data, error } = await admin.rpc("service_ai_relay_post", {
          p_channel: "instruction",
          p_author: "chatgpt",
          p_body: text,
        });
        if (error) throw error;
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
