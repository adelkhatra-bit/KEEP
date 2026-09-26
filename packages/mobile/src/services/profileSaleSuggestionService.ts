import { supabase } from './supabaseClient';

export type ProfileSaleSuggestion = {
  offerId: string;
  sellerId: string;
  sellerUsername: string;
  sellerAvatarUrl: string | null;
  playlistName: string;
  trackCount: number;
  genres: string[];
  paymentMode: 'FREE' | 'MONEY';
  priceCents: number;
  freePrice: number | null;
  currencyCode: string;
  matchScore: number;
};

export async function loadProfileSaleSuggestions(limit = 8): Promise<ProfileSaleSuggestion[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('keep_profile_sale_suggestions', { p_limit: limit });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    offerId: String(row.offer_id ?? ''),
    sellerId: String(row.seller_id ?? ''),
    sellerUsername: String(row.seller_username ?? ''),
    sellerAvatarUrl: row.seller_avatar_url ? String(row.seller_avatar_url) : null,
    playlistName: String(row.playlist_name ?? 'Sélection'),
    trackCount: Number(row.track_count ?? 0),
    genres: Array.isArray(row.genres) ? row.genres.map(String).filter(Boolean).slice(0, 3) : [],
    paymentMode: String(row.payment_mode ?? 'MONEY').toUpperCase() === 'FREE' ? 'FREE' : 'MONEY',
    priceCents: Number(row.price_cents ?? 0),
    freePrice: row.free_price == null ? null : Number(row.free_price),
    currencyCode: String(row.currency_code ?? 'EUR'),
    matchScore: Number(row.match_score ?? 0),
  })).filter((row) => row.offerId && row.sellerId);
}
