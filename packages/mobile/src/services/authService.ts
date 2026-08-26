/** Auth KEEP réelle (Supabase Auth). Les nouveaux comptes e-mail doivent être confirmés avant connexion. */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface KeepAuthSession {
  userId: string;
  email: string | null;
  username: string | null;
  isAnonymous: boolean;
}

export interface UsernameAuthResult {
  error: string | null;
  username?: string;
  userId?: string;
  requiresEmailConfirmation?: boolean;
}

export interface AuthService {
  signInAsGuest(): Promise<{ error: string | null }>;
  signUpWithEmailIdentity(email: string, username: string, password: string): Promise<UsernameAuthResult>;
  signInWithEmailIdentity(email: string, password: string): Promise<UsernameAuthResult>;
  resendSignupConfirmation(email: string): Promise<{ error: string | null }>;
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

const KEEP_PUBLIC_URL = 'https://adelkhatra-bit.github.io/KEEP/';

function normalizeUsername(username: string) {
  return username.trim().replace(/^@+/, '').normalize('NFKC');
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function usernameFromMetadata(user: any): string | null {
  const value = user?.user_metadata?.keep_username;
  if (typeof value !== 'string') return null;
  const clean = normalizeUsername(value);
  return clean || null;
}

function mapSignupError(message: string): string {
  const value = message.toLowerCase();
  if (value.includes('already') || value.includes('registered') || value.includes('exists')) return 'email_taken';
  if (value.includes('email')) return 'invalid_email';
  if (value.includes('password')) return 'invalid_password';
  if (value.includes('profile') || value.includes('username') || value.includes('duplicate')) return 'username_taken';
  return message || 'server_error';
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
      requiresEmailConfirmation: false,
    };
  };

  const legacyUsernameAuth = async (action: 'signup' | 'login', username: string, password: string): Promise<UsernameAuthResult> => {
    return invokeAccountAuth({ action, username: normalizeUsername(username), password, legacy_username: '1' });
  };

  return {
    async signInAsGuest() {
      // Héritage uniquement. L'essai public actuel est local et ne doit jamais
      // créer un nouvel utilisateur Supabase anonyme.
      const { data: existing } = await client.auth.getSession();
      if (existing.session?.user) return { error: null };
      return { error: 'guest_auth_disabled' };
    },

    async signUpWithEmailIdentity(email, username, password) {
      const cleanEmail = normalizeEmail(email);
      const cleanUsername = normalizeUsername(username);

      // Utiliser Supabase Auth directement est volontaire : contrairement à
      // admin.createUser(email_confirm:true), signUp déclenche le vrai mail de
      // confirmation. Le compte n'obtient donc aucune session utilisable avant
      // le clic du propriétaire de l'adresse.
      const { data, error } = await client.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: { keep_username: cleanUsername },
          emailRedirectTo: KEEP_PUBLIC_URL,
        },
      });
      if (error) return { error: mapSignupError(error.message) };
      if (!data.user) return { error: 'account_not_created' };

      // Avec l'énumération sécurisée de Supabase, une adresse déjà inscrite peut
      // revenir sans identité au lieu d'une erreur explicite.
      if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        return { error: 'email_taken' };
      }

      // Hosted Supabase doit demander la confirmation. Si un environnement de
      // test la désactive, on n'annonce jamais à tort que l'adresse a été vérifiée.
      if (data.session) {
        await client.auth.signOut().catch(() => {});
        return { error: 'email_confirmation_not_enabled' };
      }

      return {
        error: null,
        username: cleanUsername,
        userId: data.user.id,
        requiresEmailConfirmation: true,
      };
    },

    async signInWithEmailIdentity(email, password) {
      return invokeAccountAuth({
        action: 'login',
        email: normalizeEmail(email),
        password,
      });
    },

    async resendSignupConfirmation(email) {
      const cleanEmail = normalizeEmail(email);
      if (!cleanEmail) return { error: 'invalid_email' };
      const { error } = await client.auth.resend({
        type: 'signup',
        email: cleanEmail,
        options: { emailRedirectTo: KEEP_PUBLIC_URL },
      });
      return { error: error ? mapSignupError(error.message) : null };
    },

    async signUpWithUsername(username, password) {
      return legacyUsernameAuth('signup', username, password);
    },

    async signInWithUsername(username, password) {
      return legacyUsernameAuth('login', username, password);
    },

    async requestEmailMagicLink() {
      return { error: 'email_flow_disabled' };
    },

    async requestEmailLink() {
      return { error: 'email_flow_disabled' };
    },

    async verifyEmailLink() {
      return { error: 'email_flow_disabled' };
    },

    async signUpWithPassword() {
      return { error: 'email_flow_disabled', sessionCreated: false };
    },

    async signInWithPassword(email, password) {
      const result = await invokeAccountAuth({ action: 'login', email: normalizeEmail(email), password });
      return { error: result.error };
    },

    async getCurrentSession() {
      const { data } = await client.auth.getSession();
      const user = data.session?.user;
      return user ? {
        userId: user.id,
        email: user.email ?? null,
        username: usernameFromMetadata(user),
        isAnonymous: Boolean(user.is_anonymous),
      } : null;
    },

    async signOut() {
      await client.auth.signOut();
    },

    onSessionChange(callback) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        const user = session?.user;
        callback(user ? {
          userId: user.id,
          email: user.email ?? null,
          username: usernameFromMetadata(user),
          isAnonymous: Boolean(user.is_anonymous),
        } : null);
      });
      return () => data.subscription.unsubscribe();
    },
  };
}