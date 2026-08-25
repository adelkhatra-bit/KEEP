import axios from 'axios';

export interface BrevoMessage {
  to: { email: string; name?: string }[];
  subject: string;
  htmlContent: string;
  textContent?: string;
}

export function isBrevoConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);
}

export async function sendBrevoEmail(message: BrevoMessage): Promise<{ messageId?: string }> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'KEEP';

  if (!apiKey || !senderEmail) {
    throw new Error('Brevo non configuré: BREVO_API_KEY et BREVO_SENDER_EMAIL sont requis côté backend.');
  }

  const response = await axios.post(
    'https://api.brevo.com/v3/smtp/email',
    {
      sender: { email: senderEmail, name: senderName },
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

  return response.data ?? {};
}
