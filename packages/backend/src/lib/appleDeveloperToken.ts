import crypto from 'crypto';

/**
 * Génération du "developer token" Apple Music (JWT ES256), signé avec la clé
 * privée MusicKit du compte Apple Developer. Ce fichier ne dépend d'aucun
 * package npm (uniquement `crypto`, natif Node) — cohérent avec la
 * contrainte d'environnement documentée dans docs/PROJECT_STATUS.md (aucune
 * dépendance nouvelle installable ici) et avec la philosophie "pas de
 * dépendance si le standard library suffit".
 *
 * ATTENTION — à ne jamais confondre (deux clés Apple différentes) :
 * - Cette clé MusicKit (Certificates, Identifiers & Profiles → Keys → cocher
 *   "MusicKit") sert UNIQUEMENT à signer les developer tokens de l'API
 *   Apple Music. Elle vit ici, backend uniquement.
 * - La clé API App Store Connect (utilisée par le pipeline CI EAS Build,
 *   voir docs/DEPLOYMENT_TESTFLIGHT.md) sert à publier des builds. Autre
 *   clé, autre usage, jamais interchangeables.
 *
 * Le developer token n'est JAMAIS envoyé tel quel à l'app mobile pour un
 * usage prolongé : il est régénéré ici et exposé via un endpoint backend de
 * courte durée de vie (voir routes/music.ts), pas embarqué en dur côté
 * client — un secret ne doit jamais avoir besoin d'être aussi long-lived
 * que nécessaire pour limiter l'impact d'une fuite.
 */

const MAX_APPLE_TOKEN_LIFETIME_SEC = 15777000; // 6 mois, plafond imposé par Apple.
const DEFAULT_TOKEN_LIFETIME_SEC = 60 * 60; // 1h : régénéré à la demande côté backend, pas besoin de plus.

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface AppleDeveloperTokenConfig {
  teamId: string;
  keyId: string;
  /** Contenu PEM complet de la clé privée .p8 (jamais un chemin de fichier en prod — variable d'env). */
  privateKeyPem: string;
  lifetimeSec?: number;
}

export interface SignedAppleDeveloperToken {
  token: string;
  expiresAt: number; // epoch seconds
}

export function signAppleMusicDeveloperToken(config: AppleDeveloperTokenConfig): SignedAppleDeveloperToken {
  const lifetime = Math.min(config.lifetimeSec ?? DEFAULT_TOKEN_LIFETIME_SEC, MAX_APPLE_TOKEN_LIFETIME_SEC);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + lifetime;

  const header = { alg: 'ES256', kid: config.keyId };
  const payload = { iss: config.teamId, iat: now, exp: expiresAt };

  const headerB64 = base64url(Buffer.from(JSON.stringify(header)));
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  // dsaEncoding: 'ieee-p1363' -> signature brute r||s (64 octets), le format
  // attendu par JWS ES256 (par opposition au DER par défaut de Node).
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: config.privateKeyPem,
    dsaEncoding: 'ieee-p1363',
  });

  return { token: `${signingInput}.${base64url(signature)}`, expiresAt };
}

/** Cache en mémoire process — régénère uniquement quand le token approche son expiration. */
let cached: SignedAppleDeveloperToken | null = null;

export function getOrCreateAppleMusicDeveloperToken(config: AppleDeveloperTokenConfig): SignedAppleDeveloperToken {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt - now > 300) {
    return cached;
  }
  cached = signAppleMusicDeveloperToken(config);
  return cached;
}

/** Utilisé par les tests pour repartir d'un état propre entre deux scénarios. */
export function resetAppleMusicDeveloperTokenCacheForTests(): void {
  cached = null;
}
