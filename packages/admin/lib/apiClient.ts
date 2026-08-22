/**
 * Client HTTP vers l'API Super Admin réelle (packages/backend/src/routes/admin.ts).
 * Attache automatiquement la session Supabase courante -- ces routes sont
 * protégées côté backend (voir lib/adminAuth.ts), jamais appelables sans
 * un compte `admin_users` actif.
 *
 * `isBackendConfigured` = false tant que NEXT_PUBLIC_API_URL n'est pas
 * renseignée -- chaque page garde alors son comportement Mode Démo actuel
 * inchangé (pas de nouvel état "cassé").
 */
import { getSupabaseAccessToken, isSupabaseConfigured } from './supabaseClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function isPlaceholder(value: string | undefined): boolean {
  return !value || value.startsWith('your_') || value === 'undefined';
}

export const isBackendConfigured = isSupabaseConfigured && !isPlaceholder(API_URL);

export class AdminApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'AdminApiError';
  }
}

async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const accessToken = await getSupabaseAccessToken();
  if (!accessToken) {
    throw new AdminApiError('Aucune session Super Admin active -- connecte-toi.', 401);
  }

  const res = await fetch(`${API_URL}/api/admin${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...init.headers,
    },
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new AdminApiError(json?.message ?? `Requête admin échouée (HTTP ${res.status})`, res.status);
  }
  return json as T;
}

export const adminApi = {
  get: <T>(path: string) => adminFetch<T>(path),
  patch: <T>(path: string, body: unknown) => adminFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => adminFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  post: <T>(path: string, body: unknown) => adminFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
};
