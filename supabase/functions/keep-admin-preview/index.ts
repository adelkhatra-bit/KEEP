import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ADMIN_URL = "https://adelkhatra-bit.github.io/KEEP/admin-preview/";

Deno.serve((req) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Legacy Loki admin preview retired", {
      status: 410,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return new Response(null, {
    status: 308,
    headers: {
      "Location": ADMIN_URL,
      "Cache-Control": "no-store, max-age=0",
      "X-KEEP-Canonical": ADMIN_URL,
    },
  });
});
