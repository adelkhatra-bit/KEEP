import tls from 'tls';
import { getIntegrationSecret } from './integrationSecrets';
import type { BrevoMessage } from './brevo';
import { APP_NAME } from '../config/brand';

function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function dotStuff(value: string): string {
  return value.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
}

function waitFor(socket: tls.TLSSocket, accepted: number[]): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => cleanup(new Error('SMTP timeout')), 15000);

    const cleanup = (error?: Error) => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
      if (error) reject(error);
    };
    const onError = (error: Error) => cleanup(error);
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || '';
      if (!/^\d{3} /.test(last)) return;
      const code = Number(last.slice(0, 3));
      cleanup();
      if (!accepted.includes(code)) reject(new Error(`SMTP ${code}: ${last.slice(4)}`));
      else resolve(buffer);
    };

    socket.on('data', onData);
    socket.on('error', onError);
  });
}

async function command(socket: tls.TLSSocket, value: string, accepted: number[]) {
  socket.write(`${value}\r\n`);
  return waitFor(socket, accepted);
}

export async function isBrevoSmtpConfigured(): Promise<boolean> {
  const [login, key, sender] = await Promise.all([
    getIntegrationSecret('BREVO_SMTP_LOGIN'),
    getIntegrationSecret('BREVO_SMTP_KEY'),
    getIntegrationSecret('BREVO_SENDER_EMAIL'),
  ]);
  return Boolean(login && key && sender);
}

export async function sendBrevoSmtpEmail(message: BrevoMessage): Promise<{ messageId: string; transport: 'smtp' }> {
  const [login, password, senderEmail, senderName] = await Promise.all([
    getIntegrationSecret('BREVO_SMTP_LOGIN'),
    getIntegrationSecret('BREVO_SMTP_KEY'),
    getIntegrationSecret('BREVO_SENDER_EMAIL'),
    getIntegrationSecret('BREVO_SENDER_NAME'),
  ]);

  if (!login || !password || !senderEmail) {
    throw new Error('Brevo SMTP incomplet : BREVO_SMTP_LOGIN, BREVO_SMTP_KEY et BREVO_SENDER_EMAIL sont requis.');
  }
  if (!message.to.length) throw new Error('Aucun destinataire SMTP.');

  const host = process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com';
  const port = Number(process.env.BREVO_SMTP_PORT || 465);
  const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: true });

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('secureConnect', () => resolve());
      socket.once('error', reject);
    });
    await waitFor(socket, [220]);
    await command(socket, `EHLO keep.app`, [250]);
    await command(socket, 'AUTH LOGIN', [334]);
    await command(socket, Buffer.from(login).toString('base64'), [334]);
    await command(socket, Buffer.from(password).toString('base64'), [235]);
    await command(socket, `MAIL FROM:<${senderEmail}>`, [250]);
    for (const recipient of message.to) {
      await command(socket, `RCPT TO:<${recipient.email}>`, [250, 251]);
    }
    await command(socket, 'DATA', [354]);

    const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@keep.app>`;
    const fromName = encodeHeader(senderName || APP_NAME);
    const to = message.to.map((recipient) => recipient.name ? `${encodeHeader(recipient.name)} <${recipient.email}>` : recipient.email).join(', ');
    const boundary = `keep-${Date.now().toString(36)}`;
    const body = [
      `From: ${fromName} <${senderEmail}>`,
      `To: ${to}`,
      `Subject: ${encodeHeader(message.subject)}`,
      `Message-ID: ${messageId}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      message.textContent || message.htmlContent.replace(/<[^>]+>/g, ' '),
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      message.htmlContent,
      `--${boundary}--`,
      '',
    ].join('\r\n');

    socket.write(`${dotStuff(body)}\r\n.\r\n`);
    await waitFor(socket, [250]);
    socket.write('QUIT\r\n');
    return { messageId, transport: 'smtp' };
  } finally {
    socket.end();
  }
}
