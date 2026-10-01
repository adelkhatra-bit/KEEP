import { supabase } from './supabaseClient';

/**
 * Lien de paiement personnel (Adel, 16-17/09/2026) — "l'idéal c'est que
 * l'utilisateur se fait payer directement ... avec un PayPal, un truc
 * perso". KEEP ne touche jamais l'argent : chaque vendeur colle son propre
 * lien (PayPal.me, Lydia, lien Stripe personnel...), partagé pour la vente
 * de playlists ET la vente de musique originale.
 */
function client() {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  return supabase;
}

export function normalizePayoutLinkInput(value: string): string {
  const clean = String(value || '').trim();
  if (!clean) return '';
  const username = clean.replace(/^@/, '');
  if (/^[A-Za-z0-9._-]{2,80}$/.test(username) && !username.includes('..')) {
    return `https://paypal.me/${username}`;
  }
  if (/^paypal\.me\//i.test(clean)) return `https://${clean}`;
  if (/^www\.paypal\.me\//i.test(clean)) return `https://${clean}`;
  return clean;
}

export async function setMyPayoutLink(url: string): Promise<string> {
  const normalized = normalizePayoutLinkInput(url);
  const { data, error } = await client().rpc('keep_set_payout_link', { p_url: normalized });
  if (error) throw new Error(String(error.message || 'PAYOUT_LINK_SAVE_FAILED'));
  return String(data || '');
}

export async function getPayoutLinkForProfile(profileId: string): Promise<string> {
  if (!supabase || !profileId) return '';
  const { data, error } = await supabase.rpc('keep_payout_link_for_profile', { p_profile_id: profileId });
  if (error) return '';
  return String(data || '');
}


export type PayoutProvider = 'PAYPAL' | 'STRIPE' | 'LYDIA' | 'OTHER';

export function detectPayoutProvider(url: string): PayoutProvider {
  try {
    const host = new URL(normalizePayoutLinkInput(url)).hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'paypal.me' || host === 'paypal.com' || host.endsWith('.paypal.com')) return 'PAYPAL';
    if (host === 'buy.stripe.com' || host === 'checkout.stripe.com' || host.endsWith('.stripe.com')) return 'STRIPE';
    if (host === 'lydia-app.com' || host.endsWith('.lydia-app.com') || host === 'lydia.me') return 'LYDIA';
  } catch {}
  return 'OTHER';
}

export function payoutProviderLabel(url: string): string {
  const provider = detectPayoutProvider(url);
  if (provider === 'PAYPAL') return 'PayPal';
  if (provider === 'STRIPE') return 'Stripe';
  if (provider === 'LYDIA') return 'Lydia';
  return 'Lien de paiement';
}

/**
 * PayPal.Me accepte nativement un montant + devise dans le chemin :
 * paypal.me/pseudo/3EUR. Pour PayPal.Me uniquement, Loki prépare donc le
 * montant exact de l'offre afin que l'acheteur n'ait pas à le ressaisir.
 * Les autres prestataires conservent strictement l'URL fournie par le vendeur.
 */
export function buildPayoutCheckoutUrl(url: string, amountCents: number, currencyCode = 'EUR'): string {
  const clean = normalizePayoutLinkInput(url);
  if (detectPayoutProvider(clean) !== 'PAYPAL') return clean;
  try {
    const parsed = new URL(clean);
    if (parsed.hostname.toLowerCase().replace(/^www\./, '') !== 'paypal.me') return clean;
    const segments = parsed.pathname.split('/').filter(Boolean);
    const username = segments[0];
    if (!username) return clean;
    const amount = (Math.max(0, Math.round(amountCents)) / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
    const currency = String(currencyCode || 'EUR').trim().toUpperCase().replace(/[^A-Z]/g, '') || 'EUR';
    parsed.pathname = `/${username}/${amount}${currency}`;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return clean;
  }
}


export type PayoutMethods = {
  link: string;
  qrUrl: string;
};

export async function getMyPayoutMethods(): Promise<PayoutMethods> {
  if (!supabase) return { link: '', qrUrl: '' };
  const { data, error } = await supabase.rpc('keep_my_payout_methods');
  if (error) return { link: '', qrUrl: '' };
  const row = data as any;
  return {
    link: String(row?.link ?? row?.payoutLink ?? ''),
    qrUrl: String(row?.qrUrl ?? row?.payoutQrUrl ?? ''),
  };
}

export async function setMyPayoutQrUrl(url: string): Promise<string> {
  const { data, error } = await client().rpc('keep_set_payout_qr_url', { p_url: url });
  if (error) throw new Error(String(error.message || 'PAYOUT_QR_SAVE_FAILED'));
  return String(data || '');
}

export async function pickAndUploadPayoutQr(profileId: string): Promise<string | null> {
  if (!supabase) throw new Error('Supabase indisponible.');
  const ImagePicker = await import('expo-image-picker');
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Autorise l’accès aux photos pour choisir ton QR PayPal.');

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.9,
  });
  if (result.canceled || !result.assets?.[0]?.uri) return null;
  const asset = result.assets[0];

  const { data: authState, error: authError } = await supabase.auth.getUser();
  if (authError || !authState.user || authState.user.id !== profileId) {
    throw new Error('Compte requis pour enregistrer un QR de paiement.');
  }

  const response = await fetch(asset.uri);
  const blob = await response.blob();
  const mime = asset.mimeType || blob.type || 'image/png';
  const extension = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png';
  const path = `${profileId}/payout-qr.${extension}`;

  const { error: uploadError } = await supabase.storage.from('avatars').upload(path, blob, {
    upsert: true,
    contentType: mime,
    cacheControl: '3600',
  });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  const publicUrl = `${data.publicUrl}?v=${Date.now()}`;
  return setMyPayoutQrUrl(publicUrl);
}

export async function clearMyPayoutQrUrl(): Promise<void> {
  await setMyPayoutQrUrl('');
}
