import { Router } from 'express';
import { getOrCreateAppleMusicDeveloperToken } from '../lib/appleDeveloperToken';

/**
 * Routes musicales du backend KEEP.
 *
 * ⚠️ SÉCURITÉ — statut CODED, pas CONNECTED (voir docs/PROJECT_STATUS.md) :
 * cet endpoint n'est PAS encore protégé par une authentification KEEP
 * (Supabase Auth pas encore branché, cf. RESTE_A_FAIRE.md Priorité 1). Tant
 * que ce n'est pas fait, NE PAS déployer ce endpoint sur une URL publique
 * sans y ajouter un middleware d'auth qui vérifie une session KEEP valide
 * -- distribuer des developer tokens Apple Music sans contrôle d'accès
 * permettrait à n'importe qui d'appeler l'API Apple Music au nom du compte
 * développeur KEEP (usage abusif du quota, pas une fuite de données
 * utilisateur, mais un vrai risque à corriger avant Mode Réel public).
 */
const router = Router();

router.get('/apple/developer-token', (req, res) => {
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
});

export default router;
