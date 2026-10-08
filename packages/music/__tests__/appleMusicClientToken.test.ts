import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const initialFetch = globalThis.fetch;
const previousUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const previousAnon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

beforeEach(() => {
  jest.resetModules();
  process.env.EXPO_PUBLIC_SUPABASE_URL = "https://project.test/";
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "public-anon";
  globalThis.fetch = jest.fn(async () => new Response(JSON.stringify({
    token: "signed-developer-token", expiresAt: Math.floor(Date.now() / 1000) + 3600,
  }), { status: 200 })) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = initialFetch;
  jest.useRealTimers();
  if (previousUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  else process.env.EXPO_PUBLIC_SUPABASE_URL = previousUrl;
  if (previousAnon === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = previousAnon;
});

function loadClient(session: string | null = "user-session") {
  const filename = resolve(__dirname, "../../mobile/src/services/appleMusicDeveloperToken.ts");
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const exports = {};
  runInNewContext(compiled.outputText, {
    exports,
    require: () => ({ getSupabaseAccessToken: async () => session, isSupabaseConfigured: true }),
    process, AbortController, Date, setTimeout, clearTimeout, fetch: globalThis.fetch,
  }, { filename });
  return exports as { getAppleMusicDeveloperToken: () => Promise<string> };
}

test("caller utilise l'endpoint Supabase canonique avec session, apikey et timeout", async () => {
  const { getAppleMusicDeveloperToken } = loadClient();
  expect(await getAppleMusicDeveloperToken()).toBe("signed-developer-token");
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  const [url, init] = (globalThis.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe("https://project.test/functions/v1/keep-apple-music-token");
  expect(init.method).toBe("POST");
  expect(init.headers.Authorization).toBe(["Bearer", "user-session"].join(" "));
  expect(init.headers.apikey).toBe("public-anon");
  expect(init.signal).toBeDefined();
});

test("caller ne contacte pas le serveur sans session authentifiée", async () => {
  const { getAppleMusicDeveloperToken } = loadClient(null);
  await expect(getAppleMusicDeveloperToken()).rejects.toThrow("connecte-toi");
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

test("caller refuse une configuration Supabase manquante", async () => {
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  const { getAppleMusicDeveloperToken } = loadClient();
  await expect(getAppleMusicDeveloperToken()).rejects.toThrow("configuration Supabase");
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

test("caller n'expose pas les erreurs fournisseur ni un jeton vide/expiré", async () => {
  const { getAppleMusicDeveloperToken } = loadClient();
  for (const response of [
    new Response("private-provider-error", { status: 503 }),
    new Response(JSON.stringify({ token: "", expiresAt: 9999999999 }), { status: 200 }),
    new Response(JSON.stringify({ token: "expired", expiresAt: 1 }), { status: 200 }),
  ]) {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce(response);
    await expect(getAppleMusicDeveloperToken()).rejects.toThrow("jeton développeur indisponible");
  }
});

test("caller interrompt réellement un appel bloqué après huit secondes", async () => {
  jest.useFakeTimers();
  globalThis.fetch = jest.fn((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
  })) as typeof fetch;
  const { getAppleMusicDeveloperToken } = loadClient();
  const rejected = expect(getAppleMusicDeveloperToken()).rejects.toThrow("jeton développeur indisponible");
  await jest.advanceTimersByTimeAsync(8000);
  await rejected;
  expect(jest.getTimerCount()).toBe(0);
});
