import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import musicRoutes from './routes/music';
import adminRoutes from './routes/admin';
import emailRoutes from './routes/email';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/music', musicRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/email', emailRoutes);

app.listen(PORT, () => {
  console.log(`KEEP Backend running on port ${PORT}`);
});
