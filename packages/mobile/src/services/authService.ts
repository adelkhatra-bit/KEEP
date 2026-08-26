/** Auth KEEP réelle (Supabase Auth). */
import type { SupabaseClient } from '@supabase/supabase-js';

const AUTH_REDIRECT_URL = process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL || 'https://adelkhatra-bit.github.io/KEEP/';

export interface KeepAuthSession {
  userId: string;
  email: string | null;
  isAnonymous: boolean;
}

export interface UsernameAuthResult {
  error: string | null;
  username?: string;
  userId?: string;
}

export interface AuthService {
  signInAsGuest(): Promise<{ error: string | null }>;
  signUpWithUsername(username: string, password: string): Promise<UsernameAuthResult>;
  signInWithUsername(username: string, password: string): Promise<UsernameAuthResult>;
  requestEmailMagicLink(email: string): Promise<{ error: string | null }>;
  requestEmailLink(email: string): Promise<{ error: string | null }>;
  verifyEmailLink(email: string, code: string): Promise<{ error: string | null }>;
  signUpWithPassword(email: string, password: string): Promise<{ error: string | null; sessionCreated: boolean }>;
  signInWithPassword(email: string, password: string): Promise<{ error: string | null }>;
  getCurrentSession(): Promise<KeepAuthSession | null>;
  signOut(): Promise<void>;
  onSessionChange(callback: (session: KeepAuthSession | null) => void): () => void;
}

function normalizeUsername(username: string) {
  return username.trim().replace(/^@+/, '').normalize('NFKC');
}

export function createAuthService(client: SupabaseClient): AuthService {
  const usernameAuth = async (action: 'signup' | 'login', username: string, password: string): Promise<UsernameAuthResult> => {
    const cleanUsername = normalizeUsername(username);
    const { data: current } = await client.auth.getSession();
    const accessToken = current.session?.access_token;

    const { data, error } = await client.functions.invoke('keep-username-auth', {
      body: { action, username: cleanUsername, password },
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });

    if (error) return { error: error.message || 'server_error' };
    if (!data?.ok || !data?.access_token || !data?.refresh_token) {
      return { error: String(data?.error || 'server_error') };
    }

    const { error: sessionError } = await client.auth.setSession({
      access_token: String(data.access_token),
      refresh_token: String(data.refresh_token),
    });
    if (sessionError) return { error: sessionError.message };

    return {
      error: null,
      username: String(data.username || cleanUsername),
      userId: String(data.user_id || ''),
    };
  };

  return {
    async signInAsGuest() {
      // Héritage uniquement. L'essai public actuel est local et ne doit jamais
      // appeler cette méthode ni créer un nouvel auth.users anonyme.
      const { data: existing } = await client.auth.getSession();
      if (existing.session?.user) return { error: null };
      const { error } = await client.auth.signInAnonymously();
      return { error: error?.message ?? null };
    },

    async signUpWithUsername(username, password) {
      return usernameAuth('signup', username, password);
    },

    async signInWithUsername(username, password) {
      return usernameAuth('login', username, password);
    },

    // Flux e-mail conservés uniquement comme compatibilité/récupération future.
    // L'interface principale KEEP n'en dépend plus.
    async requestEmailMagicLink(email) {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: AUTH_REDIRECT_URL,
        },
      });
      return { error: error?.message ?? null };
    },

    async requestEmailLink(email) {
      const { error } = await client.auth.updateUser({ email });
      return { error: error?.message ?? null };
    },

    async verifyEmailLink(email, code) {
      const { error } = await client.auth.verifyOtp({ email, token: code, type: 'email_change' });
      return { error: error?.message ?? null };
    },

    async signUpWithPassword(email, password) {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: AUTH_REDIRECT_URL },
      });
      return { error: error?.message ?? null, sessionCreated: Boolean(data.session) };
    },

    async signInWithPassword(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    },

    async getCurrentSession() {
      const { data } = await client.auth.getSession();
      const user = data.session?.user;
      return user ? { userId: user.id, email: user.email ?? null, isAnonymous: Boolean(user.is_anonymous) } : null;
    },

    async signOut() {
      await client.auth.signOut();
    },

    onSessionChange(callback) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        const user = session?.user;
        callback(user ? { userId: user.id, email: user.email ?? null, isAnonymous: Boolean(user.is_anonymous) } : null);
      });
      return () => data.subscription.unsubscribe();
    },
  };
}
