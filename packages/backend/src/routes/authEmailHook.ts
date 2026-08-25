/**
 * Supabase Auth "Send Email" Hook (cf. demande explicite du 24/08/2026 --
 * "l'utilisateur ne doit même pas savoir que Supabase existe" + vrai test
 * montrant l'email générique "Supabase Auth" reçu malgré Brevo déjà prêt).
 *
 * Architecture choisie (cf. même demande -- "ne remplace pas Supabase Auth
 * inutilement") : Supabase Auth reste l'IDENTITÉ/SESSION (signInWithOtp/
 * verifyOtp côté mobile, inchangé) -- seul l'ENVOI de l'email est redirigé
 * ici via ce hook officiel (voir config/auth hook_send_email_*, déjà
 * supporté par le projet, jamais activé jusqu'ici). Ce fichier n'est PAS un
 * deuxième système d'auth : il reçoit juste le code que Supabase a déjà
 * généré et l'envoie avec le template/expéditeur KEEP via Brevo, au lieu du
 * mailer par défaut Supabase (qui montre "Supabase Auth" -- exactement le
 * bug constaté).
 *
 * Vérification de signature (Standard Webhooks / Svix, utilisé par Supabase
 * Auth Hooks) : HMAC-SHA256 sur `${id}.${timestamp}.${rawBody}` avec le
 * secret partagé (voir SUPABASE_AUTH_HOOK_SECRET). Corps BRUT nécessaire
 * (express.raw, PAS express.json) -- une signature calculée sur un JSON
 * re-sérialisé ne correspondrait pas à celle calculée par Supabase sur
 * l'octet-à-octet original.
 */
import express, { Router, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { confirmationCodeEmail } from '../lib/emailTemplates';

const router = Router();
const HOOK_SECRET = process.env.SUPABASE_AUTH_HOOK_SECRET;
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'no-reply@keep-app.example';

function verifySignature(rawBody: Buffer, headers: Request['headers']): boolean {
  if (!HOOK_SECRET) return false;
  const id = headers['webhook-id'] as string | undefined;
  const timestamp = headers['webhook-timestamp'] as string | undefined;
  const signatureHeader = headers['webhook-signature'] as string | undefined;
  if (!id || !timestamp || !signatureHeader) return false;

  const secretBytes = Buffer.from(HOOK_SECRET.replace(/^v1,/, '').replace(/^whsec_/, ''), 'base64');
  const signedContent = `${id}.${timestamp}.${rawBody.toString('utf8')}`;
  const expected = createHmac('sha256', secretBytes).update(signedContent).digest('base64');

  return signatureHeader.split(' ').some((part) => {
    const [, sig] = part.split(',');
    if (!sig) return false;
    try {
      return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false; // longueurs différentes -- jamais une correspondance, jamais une exception qui remonte.
    }
  });
}

async function sendViaBrevo(toEmail: string, subject: string, html: string): Promise<void> {
  if (!BREVO_API_KEY) throw new Error('BREVO_API_KEY manquant');
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'KEEP', email: BREVO_SENDER_EMAIL },
      to: [{ email: toEmail }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Brevo HTTP ${res.status}: ${detail}`);
  }
}

router.post('/send-email-hook', express.raw({ type: '*/*', limit: '1mb' }), async (req: Request, res: Response) => {
  const rawBody = req.body as Buffer;

  if (!verifySignature(rawBody, req.headers)) {
    console.warn('[KEEP][auth-hook] signature invalide ou secret manquant -- requête rejetée');
    res.status(401).json({ error: 'invalid_signature' });
    return;
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    res.status(400).json({ error: 'invalid_json' });
    return;
  }

  // STATUT HONNÊTE : format exact du payload Supabase pas garanti à 100% de
  // mémoire -- log complet ici volontairement le temps du premier vrai test
  // (cf. demande explicite "vrai test E2E"), pour ajuster immédiatement si
  // la forme réelle diffère de ce qui est lu ci-dessous.
  console.log('[KEEP][auth-hook] payload reçu:', JSON.stringify(payload));

  // BUG RÉEL trouvé le 24/08/2026 (audit "Créer mon profil" + conversion
  // invité) : pour email_action_type='email_change' (updateUser({email})
  // appelé sur une session anonyme -- seule méthode qui préserve auth.uid(),
  // voir authService.ts requestEmailLink), le NOUVEL e-mail est dans
  // `user.new_email`, PAS `user.email` (qui reste '' pour un invité sans
  // e-mail). Payload réel capturé en direct : {"user":{"email":"",
  // "new_email":"...","is_anonymous":true},"email_data":{"email_action_type":
  // "email_change",...}}. Lire le mauvais champ faisait échouer CE hook
  // (email vide -> 400 unexpected_payload_shape -> Supabase renvoie 500
  // "Invalid payload sent to hook" au client), donc AUCUN code n'était
  // jamais envoyé pour la conversion invité -> compte réel.
  const actionType: string | undefined = payload?.email_data?.email_action_type;
  const email: string | undefined =
    actionType === 'email_change' ? (payload?.user?.new_email || payload?.user?.email) : payload?.user?.email;
  const code: string | undefined = payload?.email_data?.token ?? payload?.email_data?.otp;

  if (!email || !code) {
    console.warn('[KEEP][auth-hook] champs attendus absents (email/code) -- email NON envoyé, voir log payload ci-dessus pour ajuster');
    res.status(400).json({ error: 'unexpected_payload_shape' });
    return;
  }

  try {
    const { subject, html } = confirmationCodeEmail({ code });
    await sendViaBrevo(email, subject, html);
    console.log(`[KEEP][auth-hook] email envoyé via Brevo à ${email}`);
    res.status(200).json({});
  } catch (e: any) {
    console.error('[KEEP][auth-hook] échec envoi Brevo:', e?.message);
    res.status(500).json({ error: 'send_failed', message: e?.message });
  }
});

export default router;
