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

// Adel (16-17/09/2026) : "assure-toi que les montants sont pré-écrits pour
// éviter les bugs ... ça peut se vendre maximum 10 euros" -- plus de
// saisie libre, une liste fixe seulement (imposée aussi côté serveur).
export const SALE_PRESET_PRICES_CENTS = [50, 100, 200, 300, 500, 1000] as const;

export type PlaylistSaleOffer = {
  offerId?: string;
  playlistId: string;
  playlistName: string;
  priceCents: number;
  currencyCode: string;
  coverUrl?: string | null;
  trackCount?: number;
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

export type PublicPlaylistSaleOffer = {
  offerId: string;
  playlistId: string;
  playlistName: string;
  priceCents: number;
  currencyCode: string;
  coverUrl: string | null;
  trackCount: number;
};

// Adel (14/09/2026) : "sur le profil utilisateur, fait pareil quand on va
// visiter un autre utilisateur" -- lecture publique des offres ACTIVES d'un
// vendeur donné (nom + prix uniquement), pour qu'un visiteur voie ce qui est
// à vendre sur ce profil, même si l'achat réel n'est pas encore possible.
export async function loadPlaylistSaleOffersForProfile(profileId: string): Promise<PublicPlaylistSaleOffer[]> {
  if (!supabase || !profileId) return [];
  const { data, error } = await supabase.rpc('keep_playlist_sale_offers_for_profile', { p_profile_id: profileId });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    offerId: String(row.offer_id ?? row.offerId ?? ''),
    playlistId: String(row.playlist_id ?? row.playlistId ?? ''),
    playlistName: String(row.playlist_name ?? row.playlistName ?? ''),
    priceCents: Number(row.price_cents ?? row.priceCents ?? 0),
    currencyCode: String(row.currency_code ?? row.currencyCode ?? 'EUR'),
    coverUrl: row.cover_url ?? row.coverUrl ?? null,
    trackCount: Number(row.track_count ?? row.trackCount ?? 0),
  })).filter((row) => row.offerId && row.playlistId);
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

// Adel (16-17/09/2026) : "l'idéal c'est que l'utilisateur se fait payer
// directement ... KEEP encaisse rien" -- l'acheteur clique Acheter, KEEP
// ouvre le lien de paiement PERSONNEL du vendeur (jamais un compte KEEP) et
// note la demande pour que le vendeur sache qui débloquer une fois payé.
export type PlaylistPurchaseRequest = {
  paymentId: string;
  status: 'PENDING' | 'COMPLETED';
  amountCents: number;
  currencyCode: string;
  sellerUsername: string;
  payoutLink: string;
};

export type PlaylistOfferDetails = {
  playlistId: string;
  trackCount: number;
  topArtists: string[];
  genres: string[];
  duration: number;
};

export async function loadPlaylistSaleOfferDetails(playlistId: string): Promise<PlaylistOfferDetails> {
  const { data, error } = await client().rpc('keep_playlist_sale_offer_details', { p_playlist_id: playlistId });
  if (error) throw new Error(String(error.message || 'PLAYLIST_OFFER_DETAILS_FAILED'));
  const row = data as any;
  return {
    playlistId: String(row?.playlistId ?? playlistId),
    trackCount: Number(row?.trackCount ?? 0),
    topArtists: Array.isArray(row?.topArtists) ? row.topArtists.map(String).slice(0, 5) : [],
    genres: Array.isArray(row?.genres) ? row.genres.map(String).slice(0, 3) : [],
    duration: Number(row?.duration ?? 0),
  };
}

export async function requestPlaylistPurchase(offerId: string): Promise<PlaylistPurchaseRequest> {
  const { data, error } = await client().rpc('keep_playlist_sale_request_purchase', { p_offer_id: offerId });
  if (error) throw new Error(String(error.message || 'PLAYLIST_PURCHASE_REQUEST_FAILED'));
  const row = data as any;
  return {
    paymentId: String(row?.paymentId ?? ''),
    status: (row?.status ?? 'PENDING') as 'PENDING' | 'COMPLETED',
    amountCents: Number(row?.amountCents ?? 0),
    currencyCode: String(row?.currencyCode ?? 'EUR'),
    sellerUsername: String(row?.sellerUsername ?? ''),
    payoutLink: String(row?.payoutLink ?? ''),
  };
}

export type PlaylistDeliveryResult = {
  paymentId: string;
  buyerId: string;
  playlistId: string;
  playlistName: string;
  trackCount: number;
  deliveredAt: string;
};

export async function markPlaylistSalePaid(paymentId: string): Promise<PlaylistDeliveryResult> {
  const { data, error } = await client().rpc('keep_playlist_sale_mark_paid_and_deliver', { p_payment_id: paymentId });
  if (error) throw new Error(String(error.message || 'PLAYLIST_MARK_PAID_FAILED'));
  const row = data as any;
  return {
    paymentId: String(row?.paymentId ?? paymentId),
    buyerId: String(row?.buyerId ?? ''),
    playlistId: String(row?.playlistId ?? ''),
    playlistName: String(row?.playlistName ?? ''),
    trackCount: Number(row?.trackCount ?? 0),
    deliveredAt: String(row?.deliveredAt ?? new Date().toISOString()),
  };
}

export type PlaylistSaleTransaction = {
  id: string;
  counterpartUsername: string;
  playlistName: string;
  amountCents: number;
  currencyCode: string;
  status: 'PENDING' | 'COMPLETED';
  createdAt: string;
};

export async function loadMyPlaylistSales(): Promise<PlaylistSaleTransaction[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('keep_playlist_sale_my_sales');
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    id: String(row.id ?? ''),
    counterpartUsername: String(row.buyer_username ?? ''),
    playlistName: String(row.playlist_name ?? ''),
    amountCents: Number(row.amount_cents ?? 0),
    currencyCode: String(row.currency_code ?? 'EUR'),
    status: row.status,
    createdAt: String(row.created_at ?? ''),
  })).filter((row) => row.id);
}

export async function loadMyPlaylistPurchases(): Promise<PlaylistSaleTransaction[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('keep_playlist_sale_my_purchases');
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    id: String(row.id ?? ''),
    counterpartUsername: String(row.seller_username ?? ''),
    playlistName: String(row.playlist_name ?? ''),
    amountCents: Number(row.amount_cents ?? 0),
    currencyCode: String(row.currency_code ?? 'EUR'),
    status: row.status,
    createdAt: String(row.created_at ?? ''),
  })).filter((row) => row.id);
}

// Adel (16-17/09/2026) : "l'utilisateur va pouvoir sélectionner les
// musiques qu'il va vendre ou les albums complets ... créer une sorte de
// playlist dans sa playlist" -- vente d'une sélection explicite de
// morceaux (un seul morceau, un album entier via ses morceaux, ou tout
// autre choix), distincte d'une playlist nommée entière. Même
// infrastructure de masquage/paiement, juste une autre façon de désigner
// ce qui est vendu.
export async function setPlaylistSalePriceForSelection(trackIds: string[], name: string, priceCents: number, currencyCode = 'EUR', coverUrl?: string | null): Promise<PlaylistSaleOffer> {
  const { data, error } = await client().rpc('keep_playlist_sale_set_price_for_selection_v2', {
    p_track_ids: trackIds,
    p_name: name,
    p_price_cents: Math.round(priceCents),
    p_currency_code: currencyCode,
    p_cover_url: coverUrl ?? null,
  });
  if (error) throw new Error(String(error.message || 'PLAYLIST_SALE_SELECTION_FAILED'));
  const row = data as any;
  return {
    offerId: String(row?.offerId ?? row?.id ?? ''),
    playlistId: String(row?.playlistId ?? ''),
    playlistName: String(row?.playlistName ?? name),
    priceCents: Number(row?.priceCents ?? priceCents),
    currencyCode: String(row?.currencyCode ?? currencyCode),
    coverUrl: row?.coverUrl ?? coverUrl ?? null,
    trackCount: Number(row?.trackCount ?? trackIds.length),
    isActive: true,
    updatedAt: new Date().toISOString(),
  };
}

// Adel/BACKLOG.md priorité 1 : "Pré-écoute de 15 secondes masquée" -- ne
// renvoie JAMAIS titre/artiste/jaquette par morceau (voir migration
// keep_playlist_sale_offer_preview_tracks), contrairement à
// loadPlaylistSaleOfferDetails qui reste un agrégat public. trackId n'est
// qu'un uuid technique, inutilisable pour identifier la chanson.
export type PlaylistSalePreviewTrack = {
  trackId: string;
  previewUrl: string;
};

export async function loadPlaylistSaleOfferPreviewTracks(playlistId: string): Promise<PlaylistSalePreviewTrack[]> {
  if (!supabase || !playlistId) return [];
  const { data, error } = await supabase.rpc('keep_playlist_sale_offer_preview_tracks', { p_playlist_id: playlistId });
  if (error) throw error;
  return (Array.isArray(data) ? data : [])
    .map((row: any) => ({ trackId: String(row.track_id ?? row.trackId ?? ''), previewUrl: String(row.preview_url ?? row.previewUrl ?? '') }))
    .filter((row) => row.trackId && row.previewUrl);
}

// (21/09/2026) BUG RÉEL corrigé (Adel, profil adel4a) : un morceau déjà
// inclus dans une offre "sélection multiple" devenait invisible pour le
// client après rechargement -- l'ancienne clé (éphémère, générée côté écran)
// n'était jamais retrouvable depuis les données serveur. Cette fonction
// donne le mapping réel morceau -> offre active, pour badge "En vente" et
// pour exclure proprement ces morceaux d'une nouvelle sélection.
export type PlaylistOfferedTrack = {
  trackId: string;
  offerId: string;
  playlistId: string;
  playlistName: string;
  priceCents: number;
  currencyCode: string;
};

export async function loadMyOfferedTrackIds(): Promise<Record<string, PlaylistOfferedTrack>> {
  if (!supabase) return {};
  const { data, error } = await supabase.rpc('keep_playlist_sale_my_offered_track_ids');
  if (error) throw error;
  const map: Record<string, PlaylistOfferedTrack> = {};
  for (const row of Array.isArray(data) ? data : []) {
    const trackId = String((row as any).track_id ?? (row as any).trackId ?? '');
    if (!trackId) continue;
    map[trackId] = {
      trackId,
      offerId: String((row as any).offer_id ?? (row as any).offerId ?? ''),
      playlistId: String((row as any).playlist_id ?? (row as any).playlistId ?? ''),
      playlistName: String((row as any).playlist_name ?? (row as any).playlistName ?? ''),
      priceCents: Number((row as any).price_cents ?? (row as any).priceCents ?? 0),
      currencyCode: String((row as any).currency_code ?? (row as any).currencyCode ?? 'EUR'),
    };
  }
  return map;
}

export async function loadMyPlaylistSaleOffers(): Promise<PlaylistSaleOffer[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('keep_playlist_sale_my_offers');
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    offerId: String(row.offer_id ?? row.offerId ?? ''),
    playlistId: String(row.playlist_id ?? row.playlistId ?? ''),
    playlistName: String(row.playlist_name ?? row.playlistName ?? ''),
    priceCents: Number(row.price_cents ?? row.priceCents ?? 0),
    currencyCode: String(row.currency_code ?? row.currencyCode ?? 'EUR'),
    coverUrl: row.cover_url ?? row.coverUrl ?? null,
    trackCount: Number(row.track_count ?? row.trackCount ?? 0),
    isActive: Boolean(row.is_active ?? row.isActive),
    updatedAt: String(row.updated_at ?? row.updatedAt ?? ''),
  })).filter((row) => row.playlistId);
}
