import axios from 'axios';
import { getIntegrationSecret } from './integrationSecrets';
import { isBrevoSmtpConfigured, sendBrevoSmtpEmail } from './brevoSmtp';

export interface BrevoMessage {
  to: { email: string; name?: string }[];
  subject: string;
  htmlContent: string;
  textContent?: string;
}

export async function getBrevoStatus(): Promise<{ configured: boolean; mode: 'api' | 'smtp' | 'none' }> {
  const [apiKey, senderEmail] = await Promise.all([
    getIntegrationSecret('BREVO_API_KEY'),
    getIntegrationSecret('BREVO_SENDER_EMAIL'),
  ]);
  if (apiKey && senderEmail) return { configured: true, mode: 'api' };
  if (await isBrevoSmtpConfigured()) return { configured: true, mode: 'smtp' };
  return { configured: false, mode: 'none' };
}

export async function sendBrevoEmail(message: BrevoMessage): Promise<{ messageId?: string; transport: 'api' | 'smtp' }> {
  const [apiKey, senderEmail, senderName] = await Promise.all([
    getIntegrationSecret('BREVO_API_KEY'),
    getIntegrationSecret('BREVO_SENDER_EMAIL'),
    getIntegrationSecret('BREVO_SENDER_NAME'),
  ]);

  if (apiKey && senderEmail) {
    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: { email: senderEmail, name: senderName || 'KEEP' },
        to: message.to,
        subject: message.subject,
        htmlContent: message.htmlContent,
        textContent: message.textContent,
      },
      {
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'api-key': apiKey,
        },
        timeout: 15000,
      },
    );
    return { ...(response.data ?? {}), transport: 'api' };
  }

  if (await isBrevoSmtpConfigured()) {
    return sendBrevoSmtpEmail(message);
  }

  throw new Error(
    'Brevo non configuré : renseigne soit BREVO_API_KEY + BREVO_SENDER_EMAIL, soit BREVO_SMTP_LOGIN + BREVO_SMTP_KEY + BREVO_SENDER_EMAIL dans Super Admin > Clés & intégrations.'
  );
}
