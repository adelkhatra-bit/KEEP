/** Auth KEEP réelle (Supabase Auth). Les comptes peuvent utiliser un pseudo KEEP seul ; l'e-mail reste optionnel. */
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

/**
 * Les comptes pseudo-only utilisent en interne une adresse technique
 * `<uuid>@keep.local` pour bénéficier de la session Supabase par mot de passe.
 * Cette adresse n'est jamais une donnée utilisateur et ne doit jamais remonter
 * dans le profil, les réglages ou l'interface.
 */
function visibleEmail(user: any): string | null {
  const email = typeof user?.email === 'string' ? user.email.trim() : '';
  if (!email || /@keep\.local$/i.test(email)) return null;
  return email;
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

  const usernameAuth = async (action: 'signup' | 'login', username: string, password: string): Promise<UsernameAuthResult> => {
    return invokeAccountAuth({ action, username: normalizeUsername(username), password, username_only: '1' });
  };

  return {
    async signInAsGuest() {
      const { data: existing } = await client.auth.getSession();
      if (existing.session?.user) return { error: null };
      return { error: 'guest_auth_disabled' };
    },

    async signUpWithEmailIdentity(email, username, password) {
      const cleanEmail = normalizeEmail(email);
      const cleanUsername = normalizeUsername(username);

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

      if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        return { error: 'email_taken' };
      }

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
      return usernameAuth('signup', username, password);
    },

    async signInWithUsername(username, password) {
      return usernameAuth('login', username, password);
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
        email: visibleEmail(user),
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
          email: visibleEmail(user),
          username: usernameFromMetadata(user),
          isAnonymous: Boolean(user.is_anonymous),
        } : null);
      });
      return () => data.subscription.unsubscribe();
    },
  };
}
