import { Linking, Platform } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Auth e-mail KEEP sans code à recopier.
 *
 * Le flux accepte les deux formes Supabase :
 * - tokens access_token/refresh_token après une redirection standard ;
 * - token_hash + type dans notre lien KEEP personnalisé.
 * Cette seconde forme permet au template e-mail KEEP de pointer directement
 * vers le site public, sans dépendre d'un ancien Site URL localhost.
 */
export async function consumeSupabaseAuthUrl(client: SupabaseClient, url: string): Promise<boolean> {
  if (!url) return false;

  const normalized = url.replace('#', '?');
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return false;
  }

  const tokenHash = parsed.searchParams.get('token_hash');
  const type = parsed.searchParams.get('type');
  if (tokenHash) {
    const verifyType = type === 'signup' || type === 'invite' || type === 'recovery' || type === 'email_change' || type === 'email' || type === 'magiclink'
      ? type
      : 'magiclink';
    const { error } = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type: verifyType as 'signup' | 'invite' | 'recovery' | 'email_change' | 'email' | 'magiclink',
    });
    if (error) throw error;
    return true;
  }

  const accessToken = parsed.searchParams.get('access_token');
  const refreshToken = parsed.searchParams.get('refresh_token');
  if (!accessToken || !refreshToken) return false;

  const { error } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
  return true;
}

export function subscribeToNativeAuthLinks(
  client: SupabaseClient,
  onSuccess?: () => void,
  onError?: (message: string) => void,
): () => void {
  if (Platform.OS === 'web') return () => {};

  const handle = async (url: string | null) => {
    if (!url || !url.startsWith('keep://auth/callback')) return;
    try {
      const ok = await consumeSupabaseAuthUrl(client, url);
      if (ok) onSuccess?.();
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Connexion e-mail impossible.');
    }
  };

  void Linking.getInitialURL().then(handle);
  const subscription = Linking.addEventListener('url', ({ url }) => { void handle(url); });
  return () => subscription.remove();
}

export async function consumeWebAuthAndOpenNative(client: SupabaseClient): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;

  const currentUrl = window.location.href;
  const hasHashToken = currentUrl.includes('token_hash=');
  const hasSessionTokens = currentUrl.includes('access_token=') && currentUrl.includes('refresh_token=');
  if (!hasHashToken && !hasSessionTokens) return false;

  const ok = await consumeSupabaseAuthUrl(client, currentUrl);
  if (!ok) return false;

  const current = new URL(currentUrl.replace('#', '?'));
  let accessToken = current.searchParams.get('access_token');
  let refreshToken = current.searchParams.get('refresh_token');

  // Avec nos templates token_hash, verifyOtp vient de créer la session web.
  // On la récupère afin de pouvoir transférer immédiatement cette session dans
  // l'app native installée, sans demander un deuxième login à l'utilisateur.
  if ((!accessToken || !refreshToken) && hasHashToken) {
    const { data } = await client.auth.getSession();
    accessToken = data.session?.access_token ?? null;
    refreshToken = data.session?.refresh_token ?? null;
  }

  // Nettoie immédiatement tous les secrets de connexion de la barre d'adresse.
  const cleanParams = new URLSearchParams(current.searchParams);
  for (const key of ['token_hash', 'type', 'access_token', 'refresh_token', 'expires_in', 'expires_at', 'token_type']) cleanParams.delete(key);
  const cleanQuery = cleanParams.toString();
  window.history.replaceState({}, document.title, window.location.pathname + (cleanQuery ? `?${cleanQuery}` : ''));

  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && accessToken && refreshToken) {
    const deepLink = `keep://auth/callback?access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}`;
    window.setTimeout(() => {
      window.location.href = deepLink;
    }, 120);
  }

  return true;
}
