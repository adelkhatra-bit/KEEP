/** Auth KEEP réelle (Supabase Auth). */
import type { SupabaseClient } from '@supabase/supabase-js';

const AUTH_REDIRECT_URL = process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL || 'https://adelkhatra-bit.github.io/KEEP/';

export interface KeepAuthSession {
  userId: string;
  email: string | null;
  isAnonymous: boolean;
}

export interface AuthService {
  signInAsGuest(): Promise<{ error: string | null }>;
  requestEmailMagicLink(email: string): Promise<{ error: string | null }>;
  requestEmailLink(email: string): Promise<{ error: string | null }>;
  verifyEmailLink(email: string, code: string): Promise<{ error: string | null }>;
  signUpWithPassword(email: string, password: string): Promise<{ error: string | null; sessionCreated: boolean }>;
  signInWithPassword(email: string, password: string): Promise<{ error: string | null }>;
  getCurrentSession(): Promise<KeepAuthSession | null>;
  signOut(): Promise<void>;
  onSessionChange(callback: (session: KeepAuthSession | null) => void): () => void;
}

type SupabaseAuthClient = Pick<SupabaseClient, 'auth'>;

export function createAuthService(client: SupabaseAuthClient): AuthService {
  return {
    async signInAsGuest() {
      const { data: existing } = await client.auth.getSession();
      if (existing.session?.user) return { error: null };

      const { error } = await client.auth.signInAnonymously();
      return { error: error?.message ?? null };
    },

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

    // Flux principal KEEP : e-mail + mot de passe. Il n'envoie pas de lien à
    // chaque connexion. Selon la configuration Supabase, la première création
    // peut demander une confirmation e-mail unique ; ensuite le mot de passe
    // suffit sur tous les appareils.
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
