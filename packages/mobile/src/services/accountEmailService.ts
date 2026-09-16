import { getSupabaseAccessToken, supabase } from './supabaseClient';
import { APP_NAME } from '../config/brand';

export type AccountEmailStatus = {
  email: string | null;
  emailVerified: boolean;
  pendingEmailHint: string | null;
  pendingExpiresAt: string | null;
};

function requireSupabase() {
  if (!supabase) throw new Error(`Connexion ${APP_NAME} indisponible.`);
  return supabase;
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

function configured(value: string | undefined): value is string {
  return Boolean(value && value !== 'undefined' && !value.startsWith('your_'));
}

function mapError(code: string) {
  if (code === 'invalid_email') return 'Cette adresse e-mail n’est pas valide.';
  if (code === 'rate_limited') return 'Un code vient déjà d’être envoyé. Attends quelques instants.';
  if (code === 'email_provider_unconfigured') return `L’envoi e-mail ${APP_NAME} n’est pas encore configuré dans le Super Admin.`;
  if (code === 'email_send_failed') return `${APP_NAME} n’a pas pu envoyer l’e-mail. Réessaie plus tard.`;
  if (code === 'invalid_code') return 'Ce code est incorrect.';
  if (code === 'code_expired') return 'Ce code a expiré. Demande un nouveau code.';
  if (code === 'too_many_attempts') return 'Trop d’essais. Demande un nouveau code.';
  if (code === 'email_taken') return `Cette adresse e-mail est déjà liée à un autre compte ${APP_NAME}.`;
  if (code === 'email_mismatch') return 'Cette adresse ne correspond pas à la demande en cours.';
  if (code === 'no_pending_verification') return 'Aucune vérification e-mail en attente pour le moment.';
  if (code === 'unauthorized') return `Reconnecte-toi à ${APP_NAME} pour modifier la sécurité du compte.`;
  return 'La sécurité du compte est momentanément indisponible.';
}

async function invoke(body: Record<string, unknown>) {
  requireSupabase();
  if (!configured(SUPABASE_URL) || !configured(SUPABASE_ANON_KEY)) {
    throw new Error(`Connexion ${APP_NAME} indisponible.`);
  }
  const accessToken = await getSupabaseAccessToken();
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/keep-account-email`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: ['Bearer', accessToken ?? SUPABASE_ANON_KEY].join(' '),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({ ok: false, error: 'server_error' }));
  if (!response.ok || !data?.ok) throw new Error(mapError(String(data?.error || 'server_error')));
  return data;
}

export async function getAccountEmailStatus(): Promise<AccountEmailStatus> {
  const data = await invoke({ action: 'status' });
  return {
    email: data.email ? String(data.email) : null,
    emailVerified: Boolean(data.email_verified),
    pendingEmailHint: data.pending_email_hint ? String(data.pending_email_hint) : null,
    pendingExpiresAt: data.pending_expires_at ? String(data.pending_expires_at) : null,
  };
}

export async function requestAccountEmailVerification(email: string) {
  const data = await invoke({ action: 'request', email: email.trim().toLowerCase() });
  return { emailHint: String(data.email_hint || ''), expiresInSeconds: Number(data.expires_in_seconds || 600) };
}

export async function confirmAccountEmailVerification(email: string, code: string): Promise<AccountEmailStatus> {
  await invoke({ action: 'confirm', email: email.trim().toLowerCase(), code: code.trim() });
  return getAccountEmailStatus();
}
