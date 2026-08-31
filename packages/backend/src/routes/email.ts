import { Router } from 'express';
import { getBrevoStatus, sendBrevoEmail } from '../lib/brevo';
import { APP_NAME } from '../config/brand';

const router = Router();

router.get('/status', async (_req, res) => {
  try {
    const status = await getBrevoStatus();
    res.json({ provider: 'brevo', ...status });
  } catch (error: any) {
    res.status(500).json({ provider: 'brevo', configured: false, mode: 'none', error: error?.message });
  }
});

router.post('/test', async (req, res) => {
  const adminKey = process.env.KEEP_INTERNAL_ADMIN_KEY;
  if (!adminKey || req.header('x-keep-admin-key') !== adminKey) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const email = String(req.body?.email || '').trim();
  if (!email.includes('@')) return res.status(400).json({ error: 'invalid_email' });

  try {
    const result = await sendBrevoEmail({
      to: [{ email }],
      subject: `${APP_NAME} — test e-mail Brevo`,
      htmlContent: `<div style="font-family:Arial,sans-serif"><h2>${APP_NAME}</h2><p>Brevo est correctement connecté au backend ${APP_NAME}.</p></div>`,
      textContent: `${APP_NAME} — Brevo est correctement connecté au backend ${APP_NAME}.`,
    });
    return res.json({ ok: true, provider: 'brevo', ...result });
  } catch (error: any) {
    const status = error?.response?.status || 500;
    const detail = error?.response?.data || error?.message || 'unknown_error';
    return res.status(status).json({ ok: false, provider: 'brevo', error: detail });
  }
});

export default router;
