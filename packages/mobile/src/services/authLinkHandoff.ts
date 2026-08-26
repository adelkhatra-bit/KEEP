import { Linking, Platform } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Auth e-mail KEEP sans code à recopier.
 *
 * Supabase envoie son Magic Link standard. Quand le lien revient sur la version
 * web KEEP, on récupère les jetons dans l'URL et, sur téléphone, on les transmet
 * à l'application native via le scheme keep://. Aucun fournisseur e-mail payant
 * n'est nécessaire pour ce flux de test.
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
  const hasTokens = currentUrl.includes('access_token=') && currentUrl.includes('refresh_token=');
  if (!hasTokens) return false;

  const ok = await consumeSupabaseAuthUrl(client, currentUrl);
  if (!ok) return false;

  const current = new URL(currentUrl.replace('#', '?'));
  const accessToken = current.searchParams.get('access_token');
  const refreshToken = current.searchParams.get('refresh_token');

  // Nettoie immédiatement les jetons de la barre d'adresse du navigateur.
  window.history.replaceState({}, document.title, window.location.pathname + window.location.search.replace(/[?&](access_token|refresh_token|expires_in|expires_at|token_type)=[^&]*/g, ''));

  // Sur mobile, tente d'ouvrir l'app native. Si elle n'est pas installée, la
  // session web reste valide : l'utilisateur n'est donc jamais bloqué.
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && accessToken && refreshToken) {
    const deepLink = `keep://auth/callback?access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}`;
    window.setTimeout(() => {
      window.location.href = deepLink;
    }, 120);
  }

  return true;
}
