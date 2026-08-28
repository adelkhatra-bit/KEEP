import { supabase } from './supabaseClient';

export type AccountEmailStatus = {
  email: string | null;
  emailVerified: boolean;
  pendingEmailHint: string | null;
  pendingExpiresAt: string | null;
};

function requireSupabase() {
  if (!supabase) throw new Error('Connexion KEEP indisponible.');
  return supabase;
}

function mapError(code: string) {
  if (code === 'invalid_email') return 'Cette adresse e-mail n’est pas valide.';
  if (code === 'rate_limited') return 'Un code vient déjà d’être envoyé. Attends quelques instants.';
  if (code === 'email_provider_unconfigured') return 'L’envoi e-mail KEEP n’est pas encore configuré dans le Super Admin.';
  if (code === 'email_send_failed') return 'KEEP n’a pas pu envoyer l’e-mail. Réessaie plus tard.';
  if (code === 'invalid_code') return 'Ce code est incorrect.';
  if (code === 'code_expired') return 'Ce code a expiré. Demande un nouveau code.';
  if (code === 'too_many_attempts') return 'Trop d’essais. Demande un nouveau code.';
  if (code === 'email_taken') return 'Cette adresse e-mail est déjà liée à un autre compte KEEP.';
  if (code === 'unauthorized') return 'Reconnecte-toi à KEEP pour modifier la sécurité du compte.';
  return 'La sécurité du compte est momentanément indisponible.';
}

async function invoke(body: Record<string, unknown>) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('keep-account-email', { body });
  if (error) throw new Error(error.message || 'server_error');
  if (!data?.ok) throw new Error(mapError(String(data?.error || 'server_error')));
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
