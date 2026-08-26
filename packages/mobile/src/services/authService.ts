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
  signUpWithEmailIdentity(email: string, username: string, password: string): Promise<UsernameAuthResult>;
  signInWithEmailIdentity(email: string, password: string): Promise<UsernameAuthResult>;
  /** Compatibilité avec les anciens essais créés avant le passage à l'e-mail. */
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

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function createAuthService(client: SupabaseClient): AuthService {
  const invokeAccountAuth = async (body: Record<string, string>): Promise<UsernameAuthResult> => {
    const { data: current } = await client.auth.getSession();
    const accessToken = current.session?.access_token;

    const { data, error } = await client.functions.invoke('keep-username-auth', {
      body,
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
      username: data.username ? String(data.username) : undefined,
      userId: String(data.user_id || ''),
    };
  };

  const legacyUsernameAuth = async (action: 'signup' | 'login', username: string, password: string): Promise<UsernameAuthResult> => {
    return invokeAccountAuth({ action, username: normalizeUsername(username), password, legacy_username: '1' });
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

    async signUpWithEmailIdentity(email, username, password) {
      return invokeAccountAuth({
        action: 'signup',
        email: normalizeEmail(email),
        username: normalizeUsername(username),
        password,
      });
    },

    async signInWithEmailIdentity(email, password) {
      const cleanEmail = normalizeEmail(email);
      const { data, error } = await client.auth.signInWithPassword({ email: cleanEmail, password });
      if (error || !data.session?.user) return { error: 'invalid_credentials' };

      const { data: profile } = await client
        .from('profiles')
        .select('username')
        .eq('id', data.session.user.id)
        .maybeSingle();

      return {
        error: null,
        username: profile?.username ? String(profile.username) : undefined,
        userId: data.session.user.id,
      };
    },

    async signUpWithUsername(username, password) {
      return legacyUsernameAuth('signup', username, password);
    },

    async signInWithUsername(username, password) {
      return legacyUsernameAuth('login', username, password);
    },

    // Flux e-mail conservés pour récupération/validation future.
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
