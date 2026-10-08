/** Auth Loki réelle (Supabase Auth). Le pseudo reste public ; l'e-mail devient l'identifiant privé vérifié. */
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
  requestPasswordReset(email: string): Promise<{ error: string | null }>;
  updatePassword(password: string): Promise<{ error: string | null }>;
  requestEmailLink(email: string): Promise<{ error: string | null }>;
  verifyEmailLink(email: string, code: string): Promise<{ error: string | null }>;
  signUpWithPassword(email: string, password: string): Promise<{ error: string | null; sessionCreated: boolean }>;
  signInWithPassword(email: string, password: string): Promise<{ error: string | null }>;
  getCurrentSession(): Promise<KeepAuthSession | null>;
  signOut(): Promise<void>;
  onSessionChange(callback: (session: KeepAuthSession | null) => void): () => void;
}

const KEEP_PUBLIC_URL = 'https://adelkhatra-bit.github.io/KEEP/';

// Audit 08/09/2026 (Adel a reçu "Connexion Loki indisponible pour le
// moment" sur un simple "mot de passe oublié" -- la vraie cause était une
// clé Brevo invalide côté serveur, mais ce message générique masquait tout)
// : `supabase-js` transforme toute réponse non-2xx de `functions.invoke()`
// en `FunctionsHttpError`, avec `data:null` -- le corps JSON précis que
// `keep-auth-email` renvoie déjà (invalid_email, username_taken,
// email_delivery_unavailable, etc.) n'était donc JAMAIS lu dès que l'edge
// function répondait autre chose que 200, et retombait systématiquement sur
// le générique 'server_error'. On relit le corps de la réponse HTTP réelle
// (`error.context`) avant d'abandonner.
async function invokeAuthEmail(client: SupabaseClient, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; [key: string]: unknown }> {
  const result = await invokeAuthEmailRaw(client, body);
  // Journal automatique (Adel 06/10/2026 : « les e-mails ne fonctionnent pas ») : le code d'échec réel part au journal des signalements, jamais l'adresse ni le lien.
  if (!result.ok) {
    try { require('./problemReportService').reportAutoDiagnostic('EMAIL_SEND_FAILED', `${String(body.type ?? body.action ?? body.purpose ?? 'auth')}:${String(result.error ?? 'inconnu').slice(0, 60)}`); } catch { /* le diagnostic ne gêne jamais */ }
  }
  return result;
}

async function invokeAuthEmailRaw(client: SupabaseClient, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; [key: string]: unknown }> {
  const { data, error } = await client.functions.invoke('keep-auth-email', { body });
  if (!error) return (data as any) ?? { ok: false, error: 'server_error' };
  const context = (error as any)?.context;
  if (context && typeof context.json === 'function') {
    try {
      const parsed = await context.json();
      if (parsed && typeof parsed === 'object') return parsed;
    } catch { /* corps non-JSON ou déjà consommé : repli sur server_error ci-dessous */ }
  }
  return { ok: false, error: 'server_error' };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// RÈGLE VERROUILLÉE — config/keep-product-contract.json > authResilience,
// contrôlée par scripts/verify-product-contract.cjs (publication bloquée sinon).
// Incident 02/10/2026 : Supabase Auth met jusqu'à 10 s quand la base est lente.
// Promise.race n'annule PAS la requête : abandonner avant 10 s puis relancer
// empile des requêtes en vol et plus personne n'arrive à se connecter.
// => échéance locale toujours > délai serveur Auth, et JAMAIS de relance
//    après une échéance locale (la requête précédente peut encore aboutir).
const AUTH_LOCAL_DEADLINE_MARKER = 'auth_local_deadline';
const CLIENT_PASSWORD_LOGIN_DEADLINE_MS = 15000;
const CLIENT_USERNAME_AUTH_INVOKE_DEADLINE_MS = 25000;
const MAX_SIGN_IN_ATTEMPTS = 2;
const RETRY_ONLY_FAST_FAILURE_MS = 5000;

async function withAuthDeadline<T>(promise: Promise<T>, timeoutMs = CLIENT_PASSWORD_LOGIN_DEADLINE_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`auth_temporarily_unavailable:${AUTH_LOCAL_DEADLINE_MARKER}`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function forceClearPersistedAuthSession(client: SupabaseClient): Promise<void> {
  const authClient = client.auth as any;
  const storage = authClient?.storage;
  const storageKey = authClient?.storageKey;
  if (!storage || !storageKey || typeof storage.removeItem !== 'function') return;
  try {
    await Promise.resolve(storage.removeItem(storageKey));
  } catch {
    // L'UI Loki a déjà quitté le compte. Ce filet sert surtout à empêcher
    // qu'un refresh token persistant ne ressuscite la session au prochain boot.
  }
}

function transientAuthFailure(error: unknown): boolean {
  const status = Number((error as any)?.status ?? (error as any)?.context?.status ?? 0);
  const message = String((error as any)?.message ?? error ?? '').toLowerCase();
  return status >= 500
    || message.includes('context deadline exceeded')
    || message.includes('context canceled')
    || message.includes('failed to connect')
    || message.includes('unexpected_failure')
    || message.includes('request_timeout')
    || message.includes('service unavailable')
    || message.includes('internal server error')
    || message.includes('auth_temporarily_unavailable')
    || message.includes('temporarily_unavailable');
}

async function persistedSupabaseAuthSession(client: SupabaseClient): Promise<KeepAuthSession | null> {
  try {
    const authClient = client.auth as any;
    const storage = authClient?.storage;
    const storageKey = authClient?.storageKey;
    if (!storage || !storageKey || typeof storage.getItem !== 'function') return null;
    const raw = await Promise.resolve(storage.getItem(storageKey));
    if (!raw) return null;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const session = parsed?.currentSession ?? parsed?.session ?? parsed;
    const user = session?.user;
    const expiresAt = Number(session?.expires_at ?? 0);
    // Ne jamais transformer un simple snapshot de profil en "session".
    // Ce repli n'est accepté que si Supabase lui-même a persisté une vraie
    // session encore valide avec ses tokens et son user.
    if (!session?.access_token || !session?.refresh_token || !user?.id) return null;
    if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000) + 15) return null;
    return {
      userId: String(user.id),
      email: visibleEmail(user),
      username: usernameFromMetadata(user),
      isAnonymous: Boolean(user.is_anonymous),
    };
  } catch {
    return null;
  }
}

async function retryTransient<T>(
  operation: () => Promise<T>,
  getError: (value: T) => unknown,
  attempts = MAX_SIGN_IN_ATTEMPTS,
): Promise<T> {
  let last!: T;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const attemptStartedAt = Date.now();
    last = await operation();
    const error = getError(last);
    if (!error || !transientAuthFailure(error) || attempt === attempts - 1) return last;
    // La requête abandonnée localement peut encore être traitée par le serveur :
    // relancer maintenant doublerait la charge exactement pendant la panne.
    if (String((error as any)?.message ?? error ?? '').includes(AUTH_LOCAL_DEADLINE_MARKER)) return last;
    // Un serveur qui a mis plus de 5 s à échouer est saturé : ne pas l'enfoncer.
    if (Date.now() - attemptStartedAt > RETRY_ONLY_FAST_FAILURE_MS) return last;
    await wait(Math.min(2400, 450 * (2 ** attempt)));
  }
  return last;
}

function normalizeUsername(username: string) {
  return username.trim().replace(/^@+/, '').normalize('NFKC');
}

// Un pseudo Loki peut contenir `_` et `.` ; `_`/`%` sont des jokers LIKE.
// Sans échappement, `.ilike('username', pseudo)` fait de "a_b" un motif qui
// remonte "aXb" -> faux positif de collision de pseudo. On échappe pour une
// correspondance exacte insensible à la casse (`\` = échappement LIKE Postgres).
function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
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
  if (value.includes('invalid login credentials') || value.includes('invalid credentials')) return 'invalid_credentials';
  if (
    value.includes('context deadline exceeded')
    || value.includes('context canceled')
    || value.includes('failed to connect')
    || value.includes('unexpected_failure')
    || value.includes('request_timeout')
    || value.includes('service unavailable')
    || value.includes('internal server error')
    || value.includes('auth_temporarily_unavailable')
    || value.includes('temporarily_unavailable')
  ) return 'auth_temporarily_unavailable';
  if (value.includes('rate') && value.includes('limit')) return 'rate_limited';
  if (value.includes('expired') || value.includes('otp')) return 'email_link_invalid';
  if (value.includes('already') || value.includes('registered') || value.includes('exists')) return 'email_taken';
  if (value.includes('email not confirmed') || value.includes('not confirmed')) return 'email_not_confirmed';
  // Adel (03/09/2026) : une adresse e-mail PARFAITEMENT valide
  // ("teyous007@hotmail.com") a été refusée "invalide" alors que la vraie
  // cause était une panne d'envoi SMTP côté Supabase Auth (Brevo -- "535
  // 5.7.8 Authentication failed", confirmé dans auth_logs). GoTrue renvoie
  // alors un message qui contient juste le mot "email" ("Error sending
  // confirmation email"), ce que l'ancien mapping accusait à tort comme un
  // format d'adresse invalide. On ne doit JAMAIS accuser l'adresse saisie
  // par l'utilisateur pour une panne de livraison : seul un message qui
  // parle explicitement du format ("invalid"/"unable to validate") est une
  // vraie adresse invalide ; tout le reste qui touche à "email" est une
  // panne de service (SMTP, quota, etc.), à afficher comme telle.
  if (value.includes('invalid') && value.includes('email')) return 'invalid_email';
  if (value.includes('unable to validate') && value.includes('email')) return 'invalid_email';
  if (value.includes('email')) return 'email_delivery_unavailable';
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
    // Un login explicite ne doit jamais dépendre d'une ancienne session locale.
    // getSession() peut tenter de rafraîchir un token expiré/révoqué et bloquer
    // une connexion pourtant valide. Le bearer ne sert qu'au legacy signup.
    let accessToken: string | undefined;
    if (body.action === 'signup') {
      try {
        const { data: current } = await client.auth.getSession();
        accessToken = current.session?.access_token;
      } catch {
        accessToken = undefined;
      }
    }

    // Une seule invocation côté client. Les retries transitoires sont gérés
    // dans keep-username-auth afin d'éviter les rafales client × Edge.
    let response: any;
    try {
      response = await withAuthDeadline(
        client.functions.invoke('keep-username-auth', {
          body,
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        }) as any,
        CLIENT_USERNAME_AUTH_INVOKE_DEADLINE_MS,
      );
    } catch (error) {
      return { error: mapSignupError(String((error as any)?.message || error || 'auth_temporarily_unavailable')) };
    }
    const { data, error } = response;
    if (error) return { error: mapSignupError(error.message || 'auth_temporarily_unavailable') };
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
        .ilike('username', escapeLikePattern(cleanUsername))
        .limit(1);
      if (usernames?.length) return { error: 'username_taken' };

      // Adel (03/09/2026) : client.auth.signUp() faisait envoyer l'e-mail de
      // confirmation par Supabase Auth lui-meme, via la cle SMTP configuree
      // dans le Dashboard Supabase -- une copie SEPAREE et desynchronisable
      // de la cle Brevo utilisee partout ailleurs dans Loki (integration_secrets).
      // Le jour ou l'une des deux cles est regeneree sans l'autre, TOUTE
      // inscription tombe en panne avec "535 5.7.8 Authentication failed",
      // affiche a tort comme "adresse e-mail invalide" (voir mapSignupError).
      // keep-auth-email genere le lien cote serveur (n'envoie rien lui-meme)
      // et l'envoie via l'API HTTP Brevo deja utilisee et prouvee fiable par
      // keep-account-email -- un seul endroit ou la cle Brevo vit desormais.
      const data = await invokeAuthEmail(client, {
        action: 'signup',
        email: cleanEmail,
        password,
        username: cleanUsername,
        pendingFollowUsername: cleanFollow || null,
      });
      if (!data?.ok) return { error: String(data?.error || 'server_error') };

      // Adel (03/09/2026) : "il ne faut pas bloquer les utilisateurs" quand
      // l'envoi d'e-mail est en panne -- si keep-auth-email a du activer le
      // compte lui-meme faute de pouvoir livrer l'e-mail, il renvoie une
      // session prete a l'emploi (access_token/refresh_token) : on l'installe
      // directement, l'inscription se termine normalement au lieu de bloquer
      // l'utilisateur sur un ecran "verifie ta boite mail" pour un lien qui ne
      // partira jamais. La verification reelle de l'e-mail reste a finaliser
      // plus tard (Super Admin), separement, sans jamais retarder l'utilisateur.
      if (data.access_token && data.refresh_token) {
        const { error: sessionError } = await client.auth.setSession({
          access_token: String(data.access_token),
          refresh_token: String(data.refresh_token),
        });
        if (!sessionError) {
          return {
            error: null,
            username: cleanUsername,
            userId: data.userId ? String(data.userId) : undefined,
            requiresEmailConfirmation: false,
          };
        }
      }

      return {
        error: null,
        username: cleanUsername,
        userId: data.userId ? String(data.userId) : undefined,
        requiresEmailConfirmation: true,
      };
    },

    async signInWithEmailIdentity(email, password) {
      const cleanEmail = normalizeEmail(email);
      // Une seconde tentative seulement si le serveur a lui-même répondu vite
      // par une erreur transitoire -- jamais après notre échéance locale.
      // Voir la règle verrouillée au-dessus de withAuthDeadline.
      const result = await retryTransient(
        async () => {
          try {
            return await withAuthDeadline(
              client.auth.signInWithPassword({ email: cleanEmail, password }) as any,
              CLIENT_PASSWORD_LOGIN_DEADLINE_MS,
            ) as any;
          } catch (error) {
            return { data: { session: null, user: null }, error } as any;
          }
        },
        (value: any) => value.error,
        MAX_SIGN_IN_ATTEMPTS,
      );
      const { data, error } = result;
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

    async requestPasswordReset(email) {
      // Adel (03/09/2026) : meme panne SMTP Dashboard que signUpWithEmailIdentity
      // ci-dessus ("mot de passe oublie" doit TOUJOURS fonctionner -- c'est la
      // raison d'etre de l'e-mail obligatoire a l'inscription). Meme solution :
      // keep-auth-email genere le lien et l'envoie via l'API HTTP Brevo.
      const cleanEmail = normalizeEmail(email);
      if (!validRecoveryEmail(cleanEmail)) return { error: 'invalid_email' };
      const data = await invokeAuthEmail(client, { action: 'recovery', email: cleanEmail });
      if (!data?.ok) return { error: String(data?.error || 'server_error') };
      return { error: null };
    },

    async updatePassword(password) {
      if (password.length < 10) return { error: 'invalid_password' };
      const { error } = await client.auth.updateUser({ password });
      return { error: error ? mapSignupError(error.message) : null };
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
      // Incident réel 02/10/2026 : Supabase Auth a renvoyé 500/504 pendant
      // plusieurs secondes. Une panne serveur n'est pas une déconnexion.
      // Repli autorisé uniquement sur la VRAIE session Supabase persistée et
      // encore valide — jamais sur un simple profil local, qui pouvait afficher
      // "connecté" tout en laissant Playlists/Pulse/Free vides faute de JWT.
      let initial: any;
      try {
        initial = await withAuthDeadline<any>(client.auth.getSession());
      } catch (error) {
        const persisted = transientAuthFailure(error) ? await persistedSupabaseAuthSession(client) : null;
        if (persisted) return persisted;
        throw error;
      }

      let data = initial?.data;
      if (initial?.error) {
        if (transientAuthFailure(initial.error)) {
          const persisted = await persistedSupabaseAuthSession(client);
          if (persisted) return persisted;
          throw initial.error;
        }
        return null;
      }

      if (!data?.session?.user && typeof (client.auth as any).refreshSession === 'function') {
        try {
          const refreshed: any = await withAuthDeadline<any>((client.auth as any).refreshSession());
          if (refreshed?.error) {
            if (transientAuthFailure(refreshed.error)) {
              const persisted = await persistedSupabaseAuthSession(client);
              if (persisted) return persisted;
              throw refreshed.error;
            }
            return null;
          }
          if (refreshed?.data?.session?.user) data = refreshed.data;
        } catch (error) {
          if (transientAuthFailure(error)) {
            const persisted = await persistedSupabaseAuthSession(client);
            if (persisted) return persisted;
            throw error;
          }
          return null;
        }
      }

      const user = data?.session?.user;
      return user ? {
        userId: user.id,
        email: visibleEmail(user),
        username: usernameFromMetadata(user),
        isAnonymous: Boolean(user.is_anonymous),
      } : null;
    },

    async signOut() {
      try {
        const { unregisterCurrentPushToken } = await import('./pushNotificationService');
        await Promise.race([unregisterCurrentPushToken(), wait(1500)]);
      } catch {
        // Le retrait push ne doit jamais bloquer la déconnexion locale.
      }
      // Déconnexion Loki = cet appareil uniquement. Elle doit rester possible
      // même si Supabase Auth/PostgREST traverse une panne 5xx.
      //
      // supabase-js peut conserver le refresh token si signOut() échoue côté
      // réseau. Résultat observé le 02/10 : l'UI se déconnecte puis le compte
      // réapparaît au prochain lancement. On borne l'appel et on purge toujours
      // le stockage local de la session, sans toucher aux autres appareils.
      try {
        await Promise.race([
          client.auth.signOut({ scope: 'local' }),
          wait(1500).then(() => ({ error: new Error('local_signout_timeout') })),
        ]);
      } catch {
        // Le nettoyage persistant ci-dessous reste la source de vérité locale.
      }
      await forceClearPersistedAuthSession(client);
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
