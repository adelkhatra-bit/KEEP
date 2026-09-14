import { supabase } from './supabaseClient';

/**
 * Vente de musique originale par l'artiste (Adel, 14/09/2026) — distinct de
 * playlistSaleService.ts : ici l'artiste vend SA PROPRE création (droits à
 * lui), pas une curation de morceaux externes. Modèle Bandcamp ("regarde la
 * concurrence") : extrait écoutable librement, prix fixe ou "nomme ton
 * prix" avec minimum, version complète jamais livrée tant que le paiement
 * réel (Stripe Connect) n'existe pas côté serveur.
 */
export type ArtistTrackAccess = {
  planCode: string;
  unlocked: boolean;
};

export type PricingMode = 'FIXED' | 'PAY_WHAT_YOU_WANT';

export type MyArtistTrack = {
  id: string;
  title: string;
  albumName: string | null;
  pricingMode: PricingMode;
  priceCents: number;
  minPriceCents: number | null;
  currencyCode: string;
  previewStoragePath: string;
  coverStoragePath: string | null;
  hasMaster: boolean;
  isActive: boolean;
  updatedAt: string;
};

export type PublicArtistTrackOffer = {
  id: string;
  title: string;
  albumName: string | null;
  pricingMode: PricingMode;
  priceCents: number;
  minPriceCents: number | null;
  currencyCode: string;
  previewUrl: string;
  coverUrl: string | null;
};

function client() {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  return supabase;
}

export async function getArtistTrackAccess(): Promise<ArtistTrackAccess> {
  if (!supabase) return { planCode: 'FREE', unlocked: false };
  const { data, error } = await supabase.rpc('keep_artist_track_access');
  if (error) throw error;
  const row = data as any;
  return { planCode: String(row?.planCode ?? 'FREE'), unlocked: Boolean(row?.unlocked) };
}

async function uploadToBucket(bucket: string, sellerId: string, folder: string, localUri: string, fallbackExt: string): Promise<string> {
  const response = await fetch(localUri);
  if (!response.ok && !localUri.startsWith('blob:') && !localUri.startsWith('file:')) {
    throw new Error('Impossible de lire ce fichier avant son envoi.');
  }
  const blob = await response.blob();
  const mime = blob.type || '';
  const extension = mime.includes('/') ? mime.split('/')[1] : fallbackExt;
  const path = `${sellerId}/${folder}/${Date.now()}.${extension || fallbackExt}`;
  const { error } = await client().storage.from(bucket).upload(path, blob, {
    upsert: true,
    contentType: mime || undefined,
    cacheControl: '3600',
  });
  if (error) throw error;
  return path;
}

/** Extrait promotionnel (audio) — bucket public, écoutable par tous. */
export async function uploadArtistTrackPreview(sellerId: string, localUri: string): Promise<string> {
  return uploadToBucket('artist-track-previews', sellerId, 'preview', localUri, 'mp3');
}

/** Pochette — bucket public. */
export async function uploadArtistTrackCover(sellerId: string, localUri: string): Promise<string> {
  return uploadToBucket('artist-track-previews', sellerId, 'cover', localUri, 'jpg');
}

/**
 * Fichier complet — bucket privé, aucune policy de lecture publique tant
 * que le paiement réel n'existe pas. Déposer le master maintenant "banque"
 * le contenu pour le jour où Stripe Connect sera branché, sans jamais le
 * rendre accessible avant.
 */
export async function uploadArtistTrackMaster(sellerId: string, localUri: string): Promise<string> {
  return uploadToBucket('artist-track-masters', sellerId, 'master', localUri, 'mp3');
}

export function getArtistTrackPreviewUrl(path: string): string {
  if (!supabase || !path) return '';
  const { data } = supabase.storage.from('artist-track-previews').getPublicUrl(path);
  return data.publicUrl;
}

export type SaveArtistTrackInput = {
  trackId?: string | null;
  title: string;
  albumName?: string | null;
  pricingMode: PricingMode;
  priceCents: number;
  minPriceCents?: number | null;
  currencyCode?: string;
  previewStoragePath: string;
  coverStoragePath?: string | null;
  masterStoragePath?: string | null;
  rightsConfirmed: boolean;
};

export async function saveArtistTrack(input: SaveArtistTrackInput): Promise<MyArtistTrack> {
  const { data, error } = await client().rpc('keep_artist_track_upsert', {
    p_track_id: input.trackId ?? null,
    p_title: input.title,
    p_album_name: input.albumName ?? null,
    p_pricing_mode: input.pricingMode,
    p_price_cents: Math.round(input.priceCents),
    p_min_price_cents: input.minPriceCents != null ? Math.round(input.minPriceCents) : null,
    p_currency_code: input.currencyCode ?? 'EUR',
    p_preview_storage_path: input.previewStoragePath,
    p_cover_storage_path: input.coverStoragePath ?? null,
    p_master_storage_path: input.masterStoragePath ?? null,
    p_rights_confirmed: input.rightsConfirmed,
  });
  if (error) throw new Error(String(error.message || 'ARTIST_TRACK_SAVE_FAILED'));
  const row = data as any;
  return {
    id: String(row?.id ?? ''),
    title: String(row?.title ?? input.title),
    albumName: row?.albumName ?? null,
    pricingMode: (row?.pricingMode ?? input.pricingMode) as PricingMode,
    priceCents: Number(row?.priceCents ?? input.priceCents),
    minPriceCents: row?.minPriceCents ?? null,
    currencyCode: String(row?.currencyCode ?? input.currencyCode ?? 'EUR'),
    previewStoragePath: String(row?.previewStoragePath ?? input.previewStoragePath),
    coverStoragePath: row?.coverStoragePath ?? null,
    hasMaster: Boolean(row?.hasMaster),
    isActive: Boolean(row?.isActive ?? true),
    updatedAt: new Date().toISOString(),
  };
}

export async function clearArtistTrack(trackId: string): Promise<void> {
  const { error } = await client().rpc('keep_artist_track_clear', { p_track_id: trackId });
  if (error) throw new Error(String(error.message || 'ARTIST_TRACK_CLEAR_FAILED'));
}

export async function loadMyArtistTracks(): Promise<MyArtistTrack[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('keep_artist_track_my_uploads');
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    albumName: row.album_name ?? row.albumName ?? null,
    pricingMode: (row.pricing_mode ?? row.pricingMode ?? 'FIXED') as PricingMode,
    priceCents: Number(row.price_cents ?? row.priceCents ?? 0),
    minPriceCents: row.min_price_cents ?? row.minPriceCents ?? null,
    currencyCode: String(row.currency_code ?? row.currencyCode ?? 'EUR'),
    previewStoragePath: String(row.preview_storage_path ?? row.previewStoragePath ?? ''),
    coverStoragePath: row.cover_storage_path ?? row.coverStoragePath ?? null,
    hasMaster: Boolean(row.has_master ?? row.hasMaster),
    isActive: Boolean(row.is_active ?? row.isActive),
    updatedAt: String(row.updated_at ?? row.updatedAt ?? ''),
  })).filter((row) => row.id);
}

// Adel (16-17/09/2026) : "l'idéal c'est que l'utilisateur se fait payer
// directement ... KEEP encaisse rien" -- même principe que
// playlistSaleService.ts : KEEP ouvre le lien de paiement personnel de
// l'artiste, note la demande, l'artiste confirme manuellement une fois payé
// sur SON compte -- ça débloque alors le fichier complet pour cet acheteur.
export type ArtistTrackPurchaseRequest = {
  orderId: string;
  status: 'PENDING' | 'COMPLETED';
  amountCents: number;
  currencyCode: string;
  sellerUsername: string;
  payoutLink: string;
};

export async function requestArtistTrackPurchase(trackId: string): Promise<ArtistTrackPurchaseRequest> {
  const { data, error } = await client().rpc('keep_artist_track_request_purchase', { p_track_id: trackId });
  if (error) throw new Error(String(error.message || 'ARTIST_TRACK_PURCHASE_REQUEST_FAILED'));
  const row = data as any;
  return {
    orderId: String(row?.orderId ?? ''),
    status: (row?.status ?? 'PENDING') as 'PENDING' | 'COMPLETED',
    amountCents: Number(row?.amountCents ?? 0),
    currencyCode: String(row?.currencyCode ?? 'EUR'),
    sellerUsername: String(row?.sellerUsername ?? ''),
    payoutLink: String(row?.payoutLink ?? ''),
  };
}

export async function markArtistTrackPaid(orderId: string): Promise<void> {
  const { error } = await client().rpc('keep_artist_track_mark_paid', { p_order_id: orderId });
  if (error) throw new Error(String(error.message || 'ARTIST_TRACK_MARK_PAID_FAILED'));
}

export type ArtistTrackTransaction = {
  id: string;
  counterpartUsername: string;
  trackTitle: string;
  amountCents: number;
  currencyCode: string;
  status: 'PENDING' | 'COMPLETED';
  createdAt: string;
  trackId?: string;
  masterStoragePath?: string | null;
};

export async function loadMyArtistTrackSales(): Promise<ArtistTrackTransaction[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('keep_artist_track_my_sales');
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    id: String(row.id ?? ''),
    counterpartUsername: String(row.buyer_username ?? ''),
    trackTitle: String(row.track_title ?? ''),
    amountCents: Number(row.amount_cents ?? 0),
    currencyCode: String(row.currency_code ?? 'EUR'),
    status: row.status,
    createdAt: String(row.created_at ?? ''),
  })).filter((row) => row.id);
}

export async function loadMyArtistTrackPurchases(): Promise<ArtistTrackTransaction[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('keep_artist_track_my_purchases');
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    id: String(row.id ?? ''),
    counterpartUsername: String(row.seller_username ?? ''),
    trackTitle: String(row.track_title ?? ''),
    amountCents: Number(row.amount_cents ?? 0),
    currencyCode: String(row.currency_code ?? 'EUR'),
    status: row.status,
    createdAt: String(row.created_at ?? ''),
    trackId: row.track_id ?? undefined,
    masterStoragePath: row.master_storage_path ?? null,
  })).filter((row) => row.id);
}

/** Signed URL du fichier complet -- ne fonctionne que si l'achat est COMPLETED (policy storage). */
export async function getArtistTrackMasterSignedUrl(masterStoragePath: string): Promise<string> {
  if (!supabase || !masterStoragePath) return '';
  const { data, error } = await supabase.storage.from('artist-track-masters').createSignedUrl(masterStoragePath, 3600);
  if (error || !data?.signedUrl) return '';
  return data.signedUrl;
}

export async function loadArtistTrackOffersForProfile(profileId: string): Promise<PublicArtistTrackOffer[]> {
  if (!supabase || !profileId) return [];
  const { data, error } = await supabase.rpc('keep_artist_track_offers_for_profile', { p_profile_id: profileId });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any) => {
    const previewPath = String(row.preview_storage_path ?? row.previewStoragePath ?? '');
    const coverPath = row.cover_storage_path ?? row.coverStoragePath ?? null;
    return {
      id: String(row.id ?? ''),
      title: String(row.title ?? ''),
      albumName: row.album_name ?? row.albumName ?? null,
      pricingMode: (row.pricing_mode ?? row.pricingMode ?? 'FIXED') as PricingMode,
      priceCents: Number(row.price_cents ?? row.priceCents ?? 0),
      minPriceCents: row.min_price_cents ?? row.minPriceCents ?? null,
      currencyCode: String(row.currency_code ?? row.currencyCode ?? 'EUR'),
      previewUrl: previewPath ? getArtistTrackPreviewUrl(previewPath) : '',
      coverUrl: coverPath ? getArtistTrackPreviewUrl(coverPath) : null,
    };
  }).filter((row) => row.id);
}
