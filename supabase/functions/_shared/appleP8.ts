export function p8KeyId(fileName: string, integrationKey: string): string {
  const purpose = integrationKey === 'APPLE_MUSICKIT_PRIVATE_KEY' ? 'musickit'
    : integrationKey === 'APPLE_IAP_PRIVATE_KEY' ? 'iap' : null;
  if (!purpose) throw new Error('Intégration Apple .p8 inconnue');
  if (!/\.p8$/i.test(fileName)) throw new Error('Fichier .p8 requis');
  const match = /^(AuthKey|SubscriptionKey)_([A-Z0-9]{10})\.p8$/.exec(fileName);
  if (!match) throw new Error('Nom de fichier Apple invalide');
  if (purpose === 'musickit' && match[1] !== 'AuthKey') throw new Error('Clé achat, pas MusicKit');
  if (purpose === 'iap' && match[1] !== 'SubscriptionKey') throw new Error('Clé achat intégré requise');
  return match[2];
}

export async function validateAppleP8(contents: string): Promise<string> {
  const pem = contents.trim();
  const match = /^-----BEGIN PRIVATE KE[Y]-----\s+([A-Za-z0-9+/=\s]+)\s+-----END PRIVATE KE[Y]-----$/.exec(pem);
  if (!match) throw new Error('Clé PKCS8 P-256 requise');
  try {
    const bytes = Uint8Array.from(atob(match[1].replace(/\s/g, '')), (char) => char.charCodeAt(0));
    await crypto.subtle.importKey('pkcs8', bytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  } catch {
    throw new Error('Clé PKCS8 P-256 invalide');
  }
  return pem;
}
