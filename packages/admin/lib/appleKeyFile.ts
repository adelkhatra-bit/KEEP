export type AppleKeyPurpose = 'musickit' | 'iap';

export function appleKeyPurpose(key: string): AppleKeyPurpose | null {
  if (key === 'APPLE_MUSICKIT_PRIVATE_KEY') return 'musickit';
  if (key === 'APPLE_IAP_PRIVATE_KEY') return 'iap';
  return null;
}

export function appleKeyIdField(purpose: AppleKeyPurpose): string {
  return purpose === 'musickit' ? 'APPLE_MUSICKIT_KEY_ID' : 'APPLE_IAP_KEY_ID';
}

export function integrationValueAllowsSpaces(key: string): boolean {
  return !!appleKeyPurpose(key) || key.endsWith('_JSON') || key === 'BREVO_SENDER_NAME';
}

export function conciseRefusal(message: string | null | undefined): string {
  return (message?.trim() || 'Vérification impossible').split(/\s+/).slice(0, 5).join(' ');
}
