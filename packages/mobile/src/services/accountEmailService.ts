import { supabase } from './supabaseClient';
import { APP_NAME } from '../config/brand';
import { invokeEdgeFunction } from './edgeFunctionClient';

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

function mapError(code: string) {
  if (code === 'invalid_email') return 'Cette adresse e-mail n’est pas valide.';
  if (code === 'rate_limited') return 'Un code vient déjà d’être envoyé. Attends quelques instants.';
  if (code === 'email_provider_unconfigured') return `L’envoi e-mail ${APP_NAME} n’est pas encore configuré dans le Super Admin.`;
  if (code === 'email_send_failed') return `${APP_NAME} n’a pas pu envoyer l’e-mail. Réessaie plus tard.`;
  if (code === 'network_error' || code === 'timeout') return `Connexion ${APP_NAME} indisponible. Vérifie le réseau puis réessaie.`;
  if (code === 'invalid_code') return 'Ce code est incorrect.';
  if (code === 'code_expired') return 'Ce code a expiré. Demande un nouveau code.';
  if (code === 'too_many_attempts') return 'Trop d’essais. Demande un nouveau code.';
  if (code === 'email_taken') return `Cette adresse e-mail est déjà liée à un autre compte ${APP_NAME}.`;
  if (code === 'unauthorized') return `Reconnecte-toi à ${APP_NAME} pour modifier la sécurité du compte.`;
  return 'La sécurité du compte est momentanément indisponible.';
}

async function invoke(body: Record<string, unknown>) {
  const client = requireSupabase();
  const { data, status } = await invokeEdgeFunction(client, 'keep-account-email', body, { requiresAuth: true, retries: 2 });
  if (!data?.ok) {
    const code = String(data?.error || (status === 0 ? 'network_error' : 'server_error'));
    throw new Error(mapError(code));
  }
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
