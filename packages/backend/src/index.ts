// Import EN PREMIER, effet de bord seul (charge .env dans process.env) --
// bug réel trouvé et corrigé le 23/08/2026 : les imports ES sont hoistés,
// donc `import musicRoutes...` s'exécutait AVANT `dotenv.config()` même si
// ce dernier était écrit plus haut dans le fichier -- chaque route qui lit
// process.env.SUPABASE_* au chargement du module (music.ts/admin.ts/
// social.ts/recognition.ts, toutes via createSupabaseTokenVerifier() au
// niveau module) voyait donc TOUJOURS des variables vides, quel que soit le
// contenu réel de .env -- confirmé par un test réel : /api/recognition
// répondait "auth_not_configured" alors que SUPABASE_URL/ANON_KEY étaient
// bien renseignées. Un seul import d'ordre correct suffit à corriger les
// quatre routes d'un coup, pas de dépendance circulaire à gérer.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import musicRoutes from './routes/music';
import adminRoutes from './routes/admin';
import socialRoutes from './routes/social';
import recognitionRoutes from './routes/recognition';
import devToolsRoutes from './routes/devTools';

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * CORS -- audit sécurité du 23/08/2026 : `cors()` sans options autorise
 * TOUTE origine (équivalent à `Access-Control-Allow-Origin: *`), sans
 * distinction. En dev c'est acceptable (mobile web servi depuis un tunnel
 * dont l'origine change à chaque redémarrage), mais ça ne doit jamais
 * rester ainsi une fois un vrai domaine de prod connu. `ALLOWED_ORIGINS`
 * (CSV) restreint explicitement ; NODE_ENV=production sans cette variable
 * réduit au strict minimum plutôt que de rester grand ouvert.
 */
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean);
app.use(
  cors(
    allowedOrigins
      ? { origin: allowedOrigins }
      : process.env.NODE_ENV === 'production'
        ? { origin: false } // prod sans ALLOWED_ORIGINS configuré = aucune origine cross-site autorisée, jamais un repli permissif silencieux.
        : {} // dev : origine libre (tunnels mobiles à origine changeante).
  )
);
app.use(express.json());

/**
 * Rate limit global -- audit sécurité du 23/08/2026 : aucune limite
 * n'existait, un client compromis/malveillant pouvait marteler
 * `/api/recognition/identify` (calcule un fingerprint via fpcalc à chaque
 * appel -- coût CPU réel -- et consomme le quota AcoustID/AudD partagé) ou
 * n'importe quelle autre route sans aucun frein.
 */
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));
// Plus strict spécifiquement sur la reconnaissance -- coûteuse (CPU + quota externe partagé).
const recognitionLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Musique (Apple Music developer token, etc. -- voir routes/music.ts pour le
// statut de sécurité honnête de ces routes : CODED, pas encore CONNECTED).
app.use('/api/music', musicRoutes);

// Super Admin réel -- prix, plans, quotas, feature flags, remote_config,
// utilisateurs, analytics (voir routes/admin.ts pour le statut honnête).
app.use('/api/admin', adminRoutes);

// Profils publics + Follow/Unfollow (voir routes/social.ts pour le statut honnête).
app.use('/api/social', socialRoutes);

// Reconnaissance gratuite Chromaprint/AcoustID/MusicBrainz, en amont d'AudD
// (voir routes/recognition.ts pour le statut honnête).
app.use('/api/recognition', recognitionLimiter, recognitionRoutes);

// DEV UNIQUEMENT -- corpus QA pour le bouton "TEST RECONNAISSANCE" (voir
// routes/devTools.ts, se désactive lui-même si NODE_ENV=production).
app.use('/api/dev', devToolsRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`🎵 KEEP Backend running on port ${PORT}`);
});
