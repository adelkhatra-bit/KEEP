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
  /** Session invitée Supabase Auth anonyme (pas encore un vrai compte) -- cf. bug réel du 24/08/2026 : jamais lu côté client avant ce correctif, donc ProfileScreen ne pouvait pas distinguer un invité d'un compte réel. */
  isAnonymous: boolean;
}

/**
 * Cf. demande explicite du 24/08/2026 -- "aucune erreur brute en anglais...
 * JAMAIS un message technique Supabase à l'utilisateur". `error.message` de
 * Supabase Auth est un texte anglais destiné aux devs (ex. "For security
 * purposes, you can only request this after 25 seconds"), jamais pensé pour
 * un écran final. Retourne un message KEEP + le nombre de secondes si
 * l'erreur est un rate-limit (pour piloter un vrai décompte côté écran,
 * voir OnboardingScreen.tsx) -- sinon un message générique sûr, jamais le
 * texte brut affiché tel quel.
 */
/**
 * Cf. bug réel diagnostiqué le 24/08/2026 (Adel : "j'ai essayé de mettre
 * mon adresse e-mail... ça marche pas") : un compte réel existait déjà pour
 * cette adresse (créé plus tôt dans la session), une NOUVELLE session
 * invitée tentait de LIER ce même e-mail -- Supabase refuse à raison
 * (`updateUser` ne peut jamais réclamer l'identité d'un AUTRE compte).
 * Reproduit en direct contre l'API réelle : `error_code:"email_exists"`,
 * `msg:"A user with this email address has already been registered"`.
 * Voir OnboardingScreen.handleSendCode pour le repli automatique vers une
 * connexion normale -- cette fonction ne sert que si ce repli échoue aussi.
 */
export function isEmailAlreadyRegisteredError(rawMessage: string | undefined): boolean {
  return !!rawMessage && /already.*registered|email_exists/i.test(rawMessage);
}

export function translateAuthError(rawMessage: string | undefined): { message: string; retryAfterSec?: number } {
  if (!rawMessage) return { message: 'Une erreur est survenue. Réessaie dans un instant.' };
  const rateLimitMatch = rawMessage.match(/after (\d+) seconds?/i);
  if (rateLimitMatch) {
    return { message: `Tu pourras demander un nouveau code dans ${rateLimitMatch[1]}s.`, retryAfterSec: Number(rateLimitMatch[1]) };
  }
  if (isEmailAlreadyRegisteredError(rawMessage)) {
    return { message: 'Un compte KEEP existe déjà avec cette adresse. Réessaie -- tu vas recevoir un code de connexion.' };
  }
  if (/invalid|expired|token/i.test(rawMessage)) {
    return { message: 'Ce code est invalide ou a expiré. Demande-en un nouveau.' };
  }
  if (/rate limit/i.test(rawMessage)) {
    return { message: 'Trop de tentatives. Réessaie dans quelques instants.' };
  }
  return { message: 'Une erreur est survenue. Réessaie dans un instant.' };
}

export interface AuthService {
  /**
   * Envoie un code à 6 chiffres à cette adresse (pas de mot de passe KEEP,
   * pas de deep link à gérer -- plus simple et plus fiable sur mobile
   * qu'un lien magique, cf. docs Supabase Auth "Email OTP"). Crée un NOUVEL
   * utilisateur -- à utiliser UNIQUEMENT quand il n'existe aucune session à
   * préserver (écran d'entrée, aucune session invité active). Ne JAMAIS
   * appeler ceci pour convertir un invité -- voir requestEmailLink.
   */
  requestEmailCode(email: string): Promise<{ error: string | null }>;
  /** Valide le code reçu par e-mail et ouvre la session KEEP si correct (pair de requestEmailCode). */
  verifyEmailCode(email: string, code: string): Promise<{ error: string | null }>;
  /**
   * Convertit une session INVITÉE (anonyme) existante en compte réel SANS
   * perdre son uid ni ses données (cf. bug réel du 24/08/2026 -- vérifié
   * contre la doc officielle Supabase, "Converting an anonymous user to a
   * permanent one" : signInWithOtp/verifyOtp(type:'email') est le flux de
   * connexion normal, PENSÉ POUR CRÉER UN NOUVEL UTILISATEUR -- utilisé sur
   * une session anonyme, il risque de créer une IDENTITÉ SÉPARÉE et
   * d'abandonner silencieusement les KEEP déjà faits par l'invité. Le flux
   * documenté et sûr pour préserver auth.uid() est updateUser({email}) +
   * verifyOtp(type:'email_change'), jamais signInWithOtp ici.
   */
  requestEmailLink(email: string): Promise<{ error: string | null }>;
  /** Confirme le lien e-mail envoyé par requestEmailLink (pair de requestEmailLink -- type='email_change', jamais 'email'). */
  verifyEmailLink(email: string, code: string): Promise<{ error: string | null }>;
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
      return user ? { userId: user.id, email: user.email ?? null, isAnonymous: !!user.is_anonymous } : null;
    },

    async signOut() {
      await client.auth.signOut();
    },

    onSessionChange(callback) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        const user = session?.user;
        callback(user ? { userId: user.id, email: user.email ?? null, isAnonymous: !!user.is_anonymous } : null);
      });
      return () => data.subscription.unsubscribe();
    },
  };
}
