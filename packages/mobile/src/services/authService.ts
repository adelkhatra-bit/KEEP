/**
 * Auth KEEP réelle (Supabase Auth, magic link e-mail) -- interface + service
 * séparés du client Supabase concret pour rester testable sans projet
 * Supabase réel (voir scripts/verify-auth-service.ts), même convention que
 * packages/backend/src/lib/keepAuth.ts (TokenVerifier injecté).
 *
 * Statut : "Continuer avec e-mail" est le seul flux réel branché ici.
 * Apple/Google restent sur le flux honnête existant ("pas encore connecté")
 * -- Sign in with Apple exige une entitlement + un module natif
 * (expo-apple-authentication) et Google un client OAuth séparé, tous deux
 * hors périmètre de cette itération (voir docs/RESTE_A_FAIRE.md).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface KeepAuthSession {
  userId: string;
  email: string | null;
}

export interface AuthService {
  /**
   * Envoie un code à 6 chiffres à cette adresse (pas de mot de passe KEEP,
   * pas de deep link à gérer -- plus simple et plus fiable sur mobile
   * qu'un lien magique, cf. docs Supabase Auth "Email OTP").
   */
  requestEmailCode(email: string): Promise<{ error: string | null }>;
  /** Valide le code reçu par e-mail et ouvre la session KEEP si correct. */
  verifyEmailCode(email: string, code: string): Promise<{ error: string | null }>;
  getCurrentSession(): Promise<KeepAuthSession | null>;
  signOut(): Promise<void>;
  /** Retourne une fonction de désabonnement. */
  onSessionChange(callback: (session: KeepAuthSession | null) => void): () => void;
}

type SupabaseAuthClient = Pick<SupabaseClient, 'auth'>;

export function createAuthService(client: SupabaseAuthClient): AuthService {
  return {
    async requestEmailCode(email) {
      // shouldCreateUser: true -- KEEP n'a pas d'étape d'inscription séparée,
      // la première connexion crée le compte (cohérent avec le message
      // "Continuer avec e-mail" affiché à l'utilisateur, pas "Se connecter").
      const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      return { error: error?.message ?? null };
    },

    async verifyEmailCode(email, code) {
      const { error } = await client.auth.verifyOtp({ email, token: code, type: 'email' });
      return { error: error?.message ?? null };
    },

    async getCurrentSession() {
      const { data } = await client.auth.getSession();
      const user = data.session?.user;
      return user ? { userId: user.id, email: user.email ?? null } : null;
    },

    async signOut() {
      await client.auth.signOut();
    },

    onSessionChange(callback) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        const user = session?.user;
        callback(user ? { userId: user.id, email: user.email ?? null } : null);
      });
      return () => data.subscription.unsubscribe();
    },
  };
}
