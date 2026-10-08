export const REQUIRED_INTEGRATION_KEYS = [
  'YOUTUBE_API_KEY', 'GOOGLE_TRANSLATE_API_KEY',
  'ACRCLOUD_ACCESS_KEY', 'ACRCLOUD_ACCESS_SECRET', 'ACRCLOUD_HOST',
  'BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'BREVO_SENDER_NAME',
  'APPLE_MUSICKIT_PRIVATE_KEY', 'APPLE_MUSICKIT_KEY_ID', 'APPLE_MUSICKIT_TEAM_ID',
  'SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET',
  'ACCOUNT_EMAIL_CODE_SECRET', 'AI_RELAY_API_KEY',
  'AUDD_API_KEY',
] as const;

export function runtimeIntegrationKey(key: string): string {
  if (['BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'BREVO_SENDER_NAME'].includes(key)) return 'BREVO';
  if (key.startsWith('ACRCLOUD_')) return 'ACRCLOUD';
  if (key.startsWith('APPLE_MUSICKIT_')) return 'APPLE_MUSICKIT';
  if (key.startsWith('SPOTIFY_')) return 'SPOTIFY';
  if (key.startsWith('PIPEDREAM_')) return 'PIPEDREAM_CONNECT';
  return key;
}

export const P8_KEY_IDS: Record<string, string> = {
  APPLE_MUSICKIT_PRIVATE_KEY: 'APPLE_MUSICKIT_KEY_ID',
  APPLE_IAP_PRIVATE_KEY: 'APPLE_IAP_KEY_ID',
};

export function p8KeyId(fileName: string, integrationKey: string): string {
  if (!/\.p8$/i.test(fileName)) throw new Error('Choisis un fichier .p8.');
  const match = /^(AuthKey|SubscriptionKey)_([A-Z0-9]{10})\.p8$/.exec(fileName);
  if (!match) throw new Error('Nom de fichier Apple invalide.');
  const expectedPrefix = integrationKey === 'APPLE_MUSICKIT_PRIVATE_KEY' ? 'AuthKey'
    : integrationKey === 'APPLE_IAP_PRIVATE_KEY' ? 'SubscriptionKey' : null;
  if (match[1] !== expectedPrefix) throw new Error('Mauvais type de clé Apple.');
  return match[2];
}

export async function readP8File(file: Pick<File, 'name' | 'size' | 'text'>, integrationKey: string) {
  const keyId = p8KeyId(file.name, integrationKey);
  if (file.size > 16_384) throw new Error('Fichier .p8 trop volumineux.');
  const value = (await file.text()).trim();
  const match = /^-----BEGIN PRIVATE KEY-----\s+([A-Za-z0-9+/=\s]+)\s+-----END PRIVATE KEY-----$/.exec(value);
  if (!match) throw new Error('Clé privée .p8 invalide.');
  try {
    const bytes = Uint8Array.from(atob(match[1].replace(/\s/g, '')), (char) => char.charCodeAt(0));
    await crypto.subtle.importKey('pkcs8', bytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  } catch {
    throw new Error('Clé Apple ES256 invalide.');
  }
  return { keyId, value, fileName: file.name };
}

export function shortIntegrationReason(reason: string | null | undefined): string {
  return (reason || 'Contrôle fournisseur non confirmé').trim().split(/\s+/).slice(0, 5).join(' ');
}
