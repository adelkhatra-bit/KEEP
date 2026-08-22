import { Request, Response, NextFunction } from 'express';

export interface TokenVerifier {
  verify(accessToken: string): Promise<{ userId: string } | null>;
}

export interface KeepAuthedRequest extends Request {
  keepUserId?: string;
}

/**
 * Middleware d'auth KEEP — protège les routes qui ne doivent jamais être
 * appelables anonymement (ex. distribution de developer tokens tiers, voir
 * routes/music.ts). Reçoit un `TokenVerifier` injecté plutôt que d'appeler
 * Supabase en dur ici, pour rester testable sans projet Supabase réel (voir
 * scripts/verify-keep-auth.ts) — même convention que
 * `MusicProviderAdapter`/`DeveloperTokenProvider` côté packages/music.
 */
export function requireKeepAuth(verifier: TokenVerifier) {
  return async (req: KeepAuthedRequest, res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      res.status(401).json({ error: 'unauthorized', message: 'En-tête Authorization: Bearer <token KEEP> requis.' });
      return;
    }

    const identity = await verifier.verify(token);
    if (!identity) {
      res.status(401).json({ error: 'unauthorized', message: 'Session KEEP invalide ou expirée.' });
      return;
    }

    req.keepUserId = identity.userId;
    next();
  };
}
