import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', mode: 'DEMO' });
});

// DEMO: Mock recognition endpoint
app.post('/api/recognize', (req, res) => {
  res.json({
    song: {
      id: 'demo-' + Date.now(),
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      album: 'After Hours',
      duration: 200,
      isRecognized: true,
    },
    confidence: 0.95,
    mode: 'DEMO',
  });
});

// DEMO: Mock playlists endpoint
app.get('/api/playlists', (req, res) => {
  res.json({
    playlists: [
      {
        id: 'demo-pl-1',
        name: 'My Favorites',
        songCount: 47,
      },
      {
        id: 'demo-pl-2',
        name: 'Workout Mix',
        songCount: 23,
      },
    ],
    mode: 'DEMO',
  });
});

app.listen(PORT, () => {
  console.log(`🎵 KEEP Backend running on port ${PORT}`);
  console.log(`🎭 DEMO Mode - No real APIs connected`);
});
