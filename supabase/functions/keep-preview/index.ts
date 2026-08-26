import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CANONICAL = "https://adelkhatra-bit.github.io/KEEP";
const SLUG = "keep-preview";

function suffixFromRequest(req: Request, url: URL) {
  const marker = `/functions/v1/${SLUG}`;
  const candidates = [
    url.pathname,
    req.headers.get("x-forwarded-uri") || "",
    req.headers.get("x-original-uri") || "",
    req.headers.get("x-forwarded-path") || "",
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    let pathname = raw;
    try { pathname = new URL(raw, url.origin).pathname; } catch { /* keep raw pathname */ }
    const index = pathname.indexOf(marker);
    if (index >= 0) {
      const suffix = pathname.slice(index + marker.length);
      if (suffix && suffix !== "/") return suffix.startsWith("/") ? suffix : `/${suffix}`;
    }
  }

  if (url.searchParams.has("u")) return "/share-profile/";
  return "/";
}

function canonicalUrl(req: Request) {
  const url = new URL(req.url);
  const suffix = suffixFromRequest(req, url);
  return `${CANONICAL}${suffix}${url.search}${url.hash}`;
}

Deno.serve((req) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Legacy KEEP preview is read-only", {
      status: 405,
      headers: { "Allow": "GET, HEAD", "Cache-Control": "no-store" },
    });
  }

  return new Response(null, {
    status: 308,
    headers: {
      "Location": canonicalUrl(req),
      "Cache-Control": "no-store, max-age=0",
      "X-KEEP-Canonical": CANONICAL,
    },
  });
});
