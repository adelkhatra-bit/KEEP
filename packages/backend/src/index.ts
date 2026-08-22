import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import musicRoutes from './routes/music';
import adminRoutes from './routes/admin';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

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

// Start server
app.listen(PORT, () => {
  console.log(`🎵 KEEP Backend running on port ${PORT}`);
});
