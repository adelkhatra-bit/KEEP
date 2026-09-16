import type { SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const TRANSIENT_STATUSES = new Set([0, 408, 429, 500, 502, 503, 504]);

type InvokeOptions = {
  timeoutMs?: number;
  retries?: number;
  requiresAuth?: boolean;
};

export type EdgeFunctionResult<T = any> = {
  ok: boolean;
  status: number;
  data: T | null;
};

function configured(value: string | undefined): value is string {
  return Boolean(value && value !== 'undefined' && !value.startsWith('your_'));
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseBody(response: Response): Promise<any> {
  const raw = await response.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { ok: false, error: 'server_error', detail: raw.slice(0, 300) };
  }
}

export async function invokeEdgeFunction<T = any>(
  client: SupabaseClient,
  name: string,
  body: Record<string, unknown>,
  options: InvokeOptions = {},
): Promise<EdgeFunctionResult<T>> {
  if (!configured(SUPABASE_URL) || !configured(SUPABASE_ANON_KEY)) {
    return { ok: false, status: 0, data: { ok: false, error: 'supabase_unavailable' } as T };
  }

  const retries = Math.max(0, options.retries ?? 1);
  const timeoutMs = Math.max(1000, options.timeoutMs ?? 12000);
  const { data: sessionData } = await client.auth.getSession();
  const accessToken = sessionData.session?.access_token ?? null;
  if (options.requiresAuth && !accessToken) {
    return { ok: false, status: 401, data: { ok: false, error: 'unauthorized' } as T };
  }

  let last: EdgeFunctionResult<T> = { ok: false, status: 0, data: { ok: false, error: 'network_error' } as T };

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/${name}`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `****** || SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await parseBody(response);
      last = { ok: response.ok, status: response.status, data };
    } catch (error: any) {
      last = {
        ok: false,
        status: 0,
        data: {
          ok: false,
          error: error?.name === 'AbortError' ? 'timeout' : 'network_error',
          detail: error?.message ?? 'network_error',
        } as T,
      };
    } finally {
      clearTimeout(timeout);
    }

    if (last.ok) return last;

    const code = typeof (last.data as any)?.error === 'string' ? String((last.data as any).error) : 'server_error';
    if (attempt < retries && (TRANSIENT_STATUSES.has(last.status) || code === 'network_error' || code === 'timeout' || code === 'server_error')) {
      console.warn(`[edgeFunctionClient] ${name} retry`, { attempt: attempt + 1, status: last.status, code, detail: (last.data as any)?.detail });
      await wait(300 * (attempt + 1));
      continue;
    }

    console.error(`[edgeFunctionClient] ${name} failed`, { status: last.status, code, payload: last.data });
    return last;
  }

  return last;
}
