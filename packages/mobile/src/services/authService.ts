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
  getCurrentSession(): Promise<KeepAuthSession | null>;
  signOut(): Promise<void>;
  onSessionChange(callback: (session: KeepAuthSession | null) => void): () => void;
}

type SupabaseAuthClient = Pick<SupabaseClient, 'auth'>;

export function createAuthService(client: SupabaseAuthClient): AuthService {
  return {
    async signInAsGuest() {
      // Un refresh ou un deuxième clic ne doit JAMAIS recréer un compte
      // anonyme. Les tests précédents créaient plusieurs /signup à la suite et
      // finissaient par déclencher le rate-limit Supabase (429).
      const { data: existing } = await client.auth.getSession();
      if (existing.session?.user) return { error: null };

      const { error } = await client.auth.signInAnonymously();
      return { error: error?.message ?? null };
    },

    // Premier accès / nouvel appareil : un seul e-mail de vérification.
    // Ensuite la session Supabase est persistée localement et auto-renouvelée,
    // donc KEEP ne renvoie pas un e-mail à chaque ouverture de l'application.
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

    // Conversion d'une session anonyme existante vers un compte réel en
    // conservant le même auth.uid() et donc ses crédits/KEEP/profil.
    async requestEmailLink(email) {
      const { error } = await client.auth.updateUser({ email });
      return { error: error?.message ?? null };
    },

    async verifyEmailLink(email, code) {
      const { error } = await client.auth.verifyOtp({ email, token: code, type: 'email_change' });
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
