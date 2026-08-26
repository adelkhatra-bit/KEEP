/** Auth KEEP réelle (Supabase Auth). */
import type { SupabaseClient } from '@supabase/supabase-js';

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
      const { error } = await client.auth.signInAnonymously();
      return { error: error?.message ?? null };
    },

    // Connexion e-mail KEEP : Magic Link Supabase, sans code à recopier.
    // `signInWithOtp` est le nom historique du SDK Supabase, mais lorsque le
    // template contient ConfirmationURL il envoie bien un lien cliquable.
    async requestEmailMagicLink(email) {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: 'https://adelkhatra-bit.github.io/KEEP/',
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
