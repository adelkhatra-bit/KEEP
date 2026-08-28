from pathlib import Path

p = Path('supabase/functions/keep-music-keyless-source/index.ts')
s = p.read_text(encoding='utf-8')

def once(old: str, new: str):
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'expected exactly one match, got {count}: {old[:100]!r}')
    s = s.replace(old, new, 1)

once(
    'import "jsr:@supabase/functions-js/edge-runtime.d.ts";\n',
    'import "jsr:@supabase/functions-js/edge-runtime.d.ts";\nimport { createClient } from "npm:@supabase/supabase-js@2";\n\nconst SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";\nconst SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";\nconst admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });\n',
)
once(
    '  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",',
    '  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-keep-device-id",',
)
once(
    '''function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
''',
    '''function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function allowRequest(req: Request) {
  const device = (req.headers.get("x-keep-device-id") || "guest").slice(0, 160);
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0].trim().slice(0, 80);
  const identityHash = await sha256(`keyless-source|${device}|${ip}`);
  const { data, error } = await admin.rpc("service_allow_recognition", {
    p_identity_hash: identityHash,
    p_limit: 20,
    p_window_seconds: 60,
  });
  if (error) {
    console.warn("[KEEP][keyless] rate-limit backend unavailable", error.message);
    return true;
  }
  return Boolean(data);
}
''',
)
once(
    '''  try {
    const body = await req.json().catch(() => ({}));
''',
    '''  try {
    if (!(await allowRequest(req))) {
      return json(429, { ok: false, provider: "KEYLESS_SOURCE", error: "keyless_rate_limited" });
    }
    const body = await req.json().catch(() => ({}));
''',
)

p.write_text(s, encoding='utf-8')
print('Keyless resolver CORS + rate limit applied')
