import { Router, Response } from 'express';
import { getOrCreateAppleMusicDeveloperToken } from '../lib/appleDeveloperToken';
import { requireKeepAuth, KeepAuthedRequest } from '../lib/keepAuth';
import { createSupabaseTokenVerifier } from '../lib/supabaseTokenVerifier';
import { APP_NAME } from '../config/brand';

/**
 * Routes musicales du backend Loki.
 *
 * SÉCURITÉ — corrigé le 22/08/2026 (voir docs/PROJECT_STATUS.md) : cet
 * endpoint distribue un secret (developer token Apple Music) et doit donc
 * être protégé par une session Loki valide avant tout déploiement public
 * -- sans ça, n'importe qui pourrait appeler l'API Apple Music au nom du
 * compte développeur Loki (usage abusif du quota, pas une fuite de
 * données utilisateur, mais un vrai risque). Le gate est actif dès que
 * SUPABASE_URL/SUPABASE_ANON_KEY existent ; en leur absence, l'endpoint
 * répond honnêtement 503 plutôt que d'être servi sans contrôle d'accès.
 */
const router = Router();
const tokenVerifier = createSupabaseTokenVerifier();

function developerTokenHandler(_req: KeepAuthedRequest, res: Response) {
  const teamId = process.env.APPLE_MUSICKIT_TEAM_ID;
  const keyId = process.env.APPLE_MUSICKIT_KEY_ID;
  // Les variables d'env stockent souvent les retours à la ligne échappés
  // ("\\n" littéral) -- on les restitue pour obtenir un vrai PEM multi-lignes.
  const privateKeyPem = process.env.APPLE_MUSICKIT_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!teamId || !keyId || !privateKeyPem) {
    // Jamais de faux token : on dit honnêtement que la clé MusicKit n'est
    // pas configurée plutôt que de renvoyer un succès inventé.
    res.status(501).json({
      error: 'apple_musickit_not_configured',
      message:
        "Clé MusicKit Apple non configurée côté backend (APPLE_MUSICKIT_TEAM_ID / APPLE_MUSICKIT_KEY_ID / " +
        "APPLE_MUSICKIT_PRIVATE_KEY). Voir docs/DEPLOYMENT_TESTFLIGHT.md.",
    });
    return;
  }

  try {
    const { token, expiresAt } = getOrCreateAppleMusicDeveloperToken({ teamId, keyId, privateKeyPem });
    res.json({ token, expiresAt });
  } catch (err) {
    res.status(500).json({ error: 'apple_developer_token_signing_failed', message: (err as Error).message });
  }
}

if (tokenVerifier) {
  router.get('/apple/developer-token', requireKeepAuth(tokenVerifier), developerTokenHandler);
} else {
  router.get('/apple/developer-token', (_req, res) => {
    res.status(503).json({
      error: 'auth_not_configured',
      message:
        `Authentification ${APP_NAME} non configurée côté backend (SUPABASE_URL / SUPABASE_ANON_KEY manquants) -- ` +
        'endpoint désactivé par sécurité plutôt que servi sans contrôle d’accès.',
    });
  });
}

export default router;
