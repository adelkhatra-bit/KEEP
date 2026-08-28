// BUG REEL trouve en testant reellement (crash serveur reproduit, pas suppose) :
// "dotenv.config()" etait appele APRES tous les imports de routes ci-dessous.
// En ESM/CommonJS, chaque import s'execute entierement (y compris le code de
// niveau module des fichiers routes/*.ts, qui appellent createSupabaseTokenVerifier()
// et getSupabaseAdminClient() DES LE CHARGEMENT, pas seulement dans un handler)
// AVANT que la ligne "dotenv.config()" plus bas ne s'execute -- donc ces clients
// se construisaient avec process.env encore vide dans tout lancement qui ne
// pre-definit pas SUPABASE_URL/ANON_KEY via le shell (ex. simple "npm run dev",
// contrairement au .bat qui les exporte avant node). Resultat observe : un
// verifier/adminClient null utilise ensuite sans garde -> crash serveur au
// premier vrai appel (TypeError: Cannot read properties of null (reading 'verify')).
// Fix reel : charger dotenv en tout premier import, avant toute route.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import musicRoutes from './routes/music';
import musicConnectionsRoutes from './routes/musicConnections';
import musicLibraryRoutes from './routes/musicLibrary';
import adminRoutes from './routes/admin';
import adminIntegrationsRoutes from './routes/adminIntegrations';
import emailRoutes from './routes/email';
import notificationsRoutes from './routes/notifications';
import { processExpoPushReceipts, processPendingPushNotifications } from './lib/pushNotifications';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/music', musicRoutes);
app.use('/api/music', musicConnectionsRoutes);
app.use('/api/music', musicLibraryRoutes);
app.use('/api/admin/integrations', adminIntegrationsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/notifications', notificationsRoutes);

app.listen(PORT, () => {
  console.log(`KEEP Backend running on port ${PORT}`);
});

// Boucle push complète :
// 1) création -> ticket Expo (SENT / NO_DEVICE / FAILED)
// 2) ticket -> reçu Expo (DELIVERED / FAILED)
// Les deux opérations sont sérialisées pour éviter deux cycles concurrents si
// un appel Expo ou Supabase prend exceptionnellement plus de 15 secondes.
const PUSH_POLL_INTERVAL_MS = 15000;
let pushCycleRunning = false;

async function runPushCycle() {
  if (pushCycleRunning) return;
  pushCycleRunning = true;
  try {
    await processPendingPushNotifications();
    await processExpoPushReceipts();
  } catch (e: any) {
    console.warn('[KEEP][push] cycle échoué:', e?.message);
  } finally {
    pushCycleRunning = false;
  }
}

void runPushCycle();
setInterval(() => { void runPushCycle(); }, PUSH_POLL_INTERVAL_MS);
