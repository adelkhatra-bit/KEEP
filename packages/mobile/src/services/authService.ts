/** Auth KEEP réelle (Supabase Auth). Le pseudo reste public ; l'e-mail devient l'identifiant privé vérifié. */
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
  signUpWithEmailIdentity(email: string, username: string, password: string, pendingFollowUsername?: string): Promise<UsernameAuthResult>;
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

function validRecoveryEmail(email: string) {
  return /^\S+@\S+\.\S+$/.test(email) && !/@keep\.local$/i.test(email);
}

function usernameFromMetadata(user: any): string | null {
  const value = user?.user_metadata?.keep_username;
  if (typeof value !== 'string') return null;
  const clean = normalizeUsername(value);
  return clean || null;
}

function visibleEmail(user: any): string | null {
  const email = typeof user?.email === 'string' ? user.email.trim() : '';
  if (!email || /@keep\.local$/i.test(email)) return null;
  return email;
}

function mapSignupError(message: string): string {
  const value = message.toLowerCase();
  if (value.includes('rate') && value.includes('limit')) return 'rate_limited';
  if (value.includes('expired') || value.includes('otp')) return 'email_link_invalid';
  if (value.includes('already') || value.includes('registered') || value.includes('exists')) return 'email_taken';
  if (value.includes('email not confirmed') || value.includes('not confirmed')) return 'email_not_confirmed';
  if (value.includes('email')) return 'invalid_email';
  if (value.includes('password')) return 'invalid_password';
  if (value.includes('profile') || value.includes('username') || value.includes('duplicate') || value.includes('unique')) return 'username_taken';
  return message || 'server_error';
}

async function requestMagicLink(client: SupabaseClient, email: string) {
  const cleanEmail = normalizeEmail(email);
  if (!validRecoveryEmail(cleanEmail)) return { error: 'invalid_email' };
  const { error } = await client.auth.signInWithOtp({
    email: cleanEmail,
    options: {
      emailRedirectTo: KEEP_PUBLIC_URL,
      shouldCreateUser: false,
    },
  });
  return { error: error ? mapSignupError(error.message) : null };
}

export function createAuthService(client: SupabaseClient): AuthService {
  const invokeLegacyUsernameAuth = async (body: Record<string, string>): Promise<UsernameAuthResult> => {
    const { data: current } = await client.auth.getSession();
    const accessToken = current.session?.access_token;
    const { data, error } = await client.functions.invoke('keep-username-auth', {
      body,
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });
    if (error) return { error: error.message || 'server_error' };
    if (!data?.ok || !data?.access_token || !data?.refresh_token) return { error: String(data?.error || 'server_error') };

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

  return {
    async signInAsGuest() {
      const { data: existing } = await client.auth.getSession();
      if (existing.session?.user) return { error: null };
      return { error: 'guest_auth_disabled' };
    },

    async signUpWithEmailIdentity(email, username, password, pendingFollowUsername) {
      const cleanEmail = normalizeEmail(email);
      const cleanUsername = normalizeUsername(username);
      const cleanFollow = pendingFollowUsername ? normalizeUsername(pendingFollowUsername) : '';
      if (!cleanEmail) return { error: 'invalid_email' };
      if (!cleanUsername) return { error: 'invalid_username' };

      const { data: usernames } = await client
        .from('profiles')
        .select('id')
        .ilike('username', cleanUsername)
        .limit(1);
      if (usernames?.length) return { error: 'username_taken' };

      const { data, error } = await client.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo: KEEP_PUBLIC_URL,
          data: {
            keep_username: cleanUsername,
            keep_username_only: false,
            pending_follow_username: cleanFollow || null,
          },
        },
      });
      if (error) return { error: mapSignupError(error.message) };

      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        return { error: 'email_taken' };
      }

      if (data.session) {
        await client.auth.signOut().catch(() => {});
        return { error: 'email_confirmation_required_config' };
      }

      return {
        error: null,
        username: cleanUsername,
        userId: data.user?.id,
        requiresEmailConfirmation: true,
      };
    },

    async signInWithEmailIdentity(email, password) {
      const cleanEmail = normalizeEmail(email);
      const { data, error } = await client.auth.signInWithPassword({ email: cleanEmail, password });
      if (error || !data.session) return { error: mapSignupError(error?.message || 'invalid_credentials') };
      return {
        error: null,
        username: usernameFromMetadata(data.user) || undefined,
        userId: data.user.id,
        requiresEmailConfirmation: false,
      };
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
      return invokeLegacyUsernameAuth({ action: 'signup', username: normalizeUsername(username), password, username_only: '1' });
    },

    async signInWithUsername(username, password) {
      return invokeLegacyUsernameAuth({ action: 'login', username: normalizeUsername(username), password, username_only: '1' });
    },

    async requestEmailMagicLink(email) {
      return requestMagicLink(client, email);
    },

    async requestEmailLink(email) {
      return requestMagicLink(client, email);
    },

    async verifyEmailLink(email, code) {
      const cleanEmail = normalizeEmail(email);
      const cleanCode = code.trim();
      if (!validRecoveryEmail(cleanEmail)) return { error: 'invalid_email' };
      if (!cleanCode) return { error: 'email_link_invalid' };
      const { error } = await client.auth.verifyOtp({
        email: cleanEmail,
        token: cleanCode,
        type: 'email',
      });
      return { error: error ? mapSignupError(error.message) : null };
    },

    async signUpWithPassword(email, password) {
      const generatedUsername = normalizeEmail(email).split('@')[0] || 'keep-user';
      const result = await this.signUpWithEmailIdentity(email, generatedUsername, password);
      return { error: result.error, sessionCreated: !result.requiresEmailConfirmation && !result.error };
    },

    async signInWithPassword(email, password) {
      const result = await this.signInWithEmailIdentity(email, password);
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
