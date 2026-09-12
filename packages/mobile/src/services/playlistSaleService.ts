import { supabase } from './supabaseClient';

/**
 * Vente de playlists entre utilisateurs (Adel, 14/09/2026) — chaque
 * utilisateur fixe son propre prix, débloqué à partir d'un seuil d'abonnés.
 * Construit intégralement SAUF le paiement réel : tant que la plateforme
 * Stripe Connect d'Adel n'existe pas, aucun encaissement n'est possible —
 * fixer un prix est réel et sauvegardé, mais ne débite jamais personne.
 * KEEP prend 0% pour l'instant (voir platformFeeCents toujours à 0 côté
 * Super Admin).
 */
export type PlaylistSaleAccess = {
  followers: number;
  threshold: number;
  unlocked: boolean;
};

export type PlaylistSaleOffer = {
  playlistId: string;
  playlistName: string;
  priceCents: number;
  currencyCode: string;
  isActive: boolean;
  updatedAt: string;
};

function client() {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  return supabase;
}

export async function getPlaylistSaleAccess(): Promise<PlaylistSaleAccess> {
  if (!supabase) return { followers: 0, threshold: 100, unlocked: false };
  const { data, error } = await supabase.rpc('keep_playlist_sale_access');
  if (error) throw error;
  const row = data as any;
  return {
    followers: Number(row?.followers ?? 0),
    threshold: Number(row?.threshold ?? 100),
    unlocked: Boolean(row?.unlocked),
  };
}

export async function setPlaylistSalePrice(playlistId: string, playlistName: string, priceCents: number, currencyCode = 'EUR'): Promise<PlaylistSaleOffer> {
  const { data, error } = await client().rpc('keep_playlist_sale_set_price', {
    p_playlist_id: playlistId,
    p_playlist_name: playlistName,
    p_price_cents: Math.round(priceCents),
    p_currency_code: currencyCode,
  });
  if (error) throw new Error(String(error.message || 'PLAYLIST_SALE_SET_PRICE_FAILED'));
  const row = data as any;
  return {
    playlistId: String(row?.playlistId ?? playlistId),
    playlistName: String(row?.playlistName ?? playlistName),
    priceCents: Number(row?.priceCents ?? priceCents),
    currencyCode: String(row?.currencyCode ?? currencyCode),
    isActive: Boolean(row?.isActive ?? true),
    updatedAt: new Date().toISOString(),
  };
}

export async function clearPlaylistSalePrice(playlistId: string): Promise<void> {
  const { error } = await client().rpc('keep_playlist_sale_clear_price', { p_playlist_id: playlistId });
  if (error) throw new Error(String(error.message || 'PLAYLIST_SALE_CLEAR_PRICE_FAILED'));
}

export type PublicPlaylistSaleOffer = { playlistId: string; playlistName: string; priceCents: number; currencyCode: string };

// Adel (14/09/2026) : "sur le profil utilisateur, fait pareil quand on va
// visiter un autre utilisateur" -- lecture publique des offres ACTIVES d'un
// vendeur donné (nom + prix uniquement), pour qu'un visiteur voie ce qui est
// à vendre sur ce profil, même si l'achat réel n'est pas encore possible.
export async function loadPlaylistSaleOffersForProfile(profileId: string): Promise<PublicPlaylistSaleOffer[]> {
  if (!supabase || !profileId) return [];
  const { data, error } = await supabase.rpc('keep_playlist_sale_offers_for_profile', { p_profile_id: profileId });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    playlistId: String(row.playlist_id ?? row.playlistId ?? ''),
    playlistName: String(row.playlist_name ?? row.playlistName ?? ''),
    priceCents: Number(row.price_cents ?? row.priceCents ?? 0),
    currencyCode: String(row.currency_code ?? row.currencyCode ?? 'EUR'),
  })).filter((row) => row.playlistId);
}

// Adel (15/09/2026) : "je ne vends pas de la musique, je vends ma
// découverte et ma playlist" -- les morceaux d'une playlist en vente
// active doivent rester masqués des vues publiques gratuites du profil
// (sinon rien à débloquer en payant). Retourne l'union de tous les
// track_id actuellement masqués pour ce profil, en un seul appel.
export async function loadMaskedPlaylistSaleTrackIds(sellerId: string): Promise<string[]> {
  if (!supabase || !sellerId) return [];
  const { data, error } = await supabase.rpc('keep_playlist_sale_masked_track_ids', { p_seller_id: sellerId });
  if (error) throw error;
  return Array.isArray(data) ? data.map(String) : [];
}

export async function loadMyPlaylistSaleOffers(): Promise<PlaylistSaleOffer[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('keep_playlist_sale_my_offers');
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    playlistId: String(row.playlist_id ?? row.playlistId ?? ''),
    playlistName: String(row.playlist_name ?? row.playlistName ?? ''),
    priceCents: Number(row.price_cents ?? row.priceCents ?? 0),
    currencyCode: String(row.currency_code ?? row.currencyCode ?? 'EUR'),
    isActive: Boolean(row.is_active ?? row.isActive),
    updatedAt: String(row.updated_at ?? row.updatedAt ?? ''),
  })).filter((row) => row.playlistId);
}
