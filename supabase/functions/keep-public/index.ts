import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CANONICAL = "https://adelkhatra-bit.github.io/KEEP";
const SLUG = "keep-public";

function canonicalUrl(req: Request) {
  const url = new URL(req.url);
  const marker = `/functions/v1/${SLUG}`;
  let suffix = url.pathname.startsWith(marker) ? url.pathname.slice(marker.length) : "";
  if (!suffix) suffix = "/";
  if (!suffix.startsWith("/")) suffix = `/${suffix}`;
  return `${CANONICAL}${suffix}${url.search}${url.hash}`;
}

Deno.serve((req) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Legacy KEEP endpoint is read-only", {
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
