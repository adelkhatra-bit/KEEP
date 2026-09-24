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
export const SALE_PRESET_FREE = [1, 3, 5, 10, 20, 50, 100] as const;
export type PlaylistSalePaymentMode = 'MONEY' | 'FREE';

export type PlaylistSaleOffer = {
  offerId?: string;
  playlistId: string;
  playlistName: string;
  paymentMode?: PlaylistSalePaymentMode;
  priceCents: number;
  freePrice?: number | null;
  currencyCode: string;
  coverUrl?: string | null;
  trackCount?: number;
  genres?: string[];
  isActive: boolean;
  updatedAt: string;
};

function normalizeSaleGenres(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of value) {
    const label = String(raw ?? '').trim();
    if (!label) continue;
    const key = label.toLocaleLowerCase('fr-FR');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(label);
    if (result.length >= 6) break;
  }
  return result;
}

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
  paymentMode: PlaylistSalePaymentMode;
  priceCents: number;
  freePrice: number | null;
  currencyCode: string;
  coverUrl: string | null;
  trackCount: number;
  genres: string[];
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
    paymentMode: (String(row.payment_mode ?? row.paymentMode ?? 'MONEY').toUpperCase() === 'FREE' ? 'FREE' : 'MONEY') as PlaylistSalePaymentMode,
    priceCents: Number(row.price_cents ?? row.priceCents ?? 0),
    freePrice: row.free_price == null && row.freePrice == null ? null : Number(row.free_price ?? row.freePrice),
    currencyCode: String(row.currency_code ?? row.currencyCode ?? 'EUR'),
    coverUrl: null,
    trackCount: Number(row.track_count ?? row.trackCount ?? 0),
    genres: normalizeSaleGenres(row.genres),
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
    genres: normalizeSaleGenres(row?.genres).slice(0, 3),
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

// Adel (21/09/2026, mission 3/3, base compta) : référence de paiement
// optionnelle (ex. identifiant de transaction PayPal collé par le vendeur)
// -- utile pour l'historique même sans intégration PayPal réelle.
export async function markPlaylistSalePaid(paymentId: string, paymentReference?: string): Promise<PlaylistDeliveryResult> {
  const { data, error } = await client().rpc('keep_playlist_sale_mark_paid_and_deliver', { p_payment_id: paymentId, p_payment_reference: paymentReference ?? null });
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

// Adel (21/09/2026, mission 3/3) : "Écran historique des ventes : liste
// transactions pour le vendeur (base compta : seller_id, buyer_id,
// playlist_id, amount, currency, status, dates, paypal_tx_id)." Champs
// déjà présents en base (voir migration 20260921220000) -- juste exposés
// ici, aucune nouvelle table.
export type PlaylistSaleHistoryEntry = {
  id: string;
  buyerId: string;
  buyerUsername: string;
  playlistId: string;
  playlistName: string;
  amountCents: number;
  currencyCode: string;
  status: 'PENDING' | 'COMPLETED';
  provider: string;
  paymentReference: string | null;
  createdAt: string;
  deliveredAt: string | null;
};

export async function loadMySalesHistory(): Promise<PlaylistSaleHistoryEntry[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('keep_playlist_sale_my_sales');
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    id: String(row.id ?? ''),
    buyerId: String(row.buyer_id ?? ''),
    buyerUsername: String(row.buyer_username ?? ''),
    playlistId: String(row.playlist_id ?? ''),
    playlistName: String(row.playlist_name ?? ''),
    amountCents: Number(row.amount_cents ?? 0),
    currencyCode: String(row.currency_code ?? 'EUR'),
    status: row.status,
    provider: String(row.provider ?? ''),
    paymentReference: row.provider_payment_id ?? null,
    createdAt: String(row.created_at ?? ''),
    deliveredAt: row.delivered_at ?? null,
  })).filter((row) => row.id);
}

export type PlaylistSaleUnlock = {
  offerId: string;
  deliveredPlaylistId: string;
};

export async function loadMyPlaylistSaleUnlocks(): Promise<Record<string, PlaylistSaleUnlock>> {
  if (!supabase) return {};
  const { data: sessionData } = await supabase.auth.getSession();
  const buyerId = sessionData.session?.user?.id;
  if (!buyerId) return {};
  const { data, error } = await supabase
    .from('playlist_sale_payments')
    .select('offer_id,delivered_playlist_id,status')
    .eq('buyer_id', buyerId)
    .eq('status', 'COMPLETED')
    .not('delivered_playlist_id', 'is', null);
  if (error) throw error;
  const out: Record<string, PlaylistSaleUnlock> = {};
  for (const row of data ?? []) {
    const offerId = String((row as any).offer_id ?? '');
    const deliveredPlaylistId = String((row as any).delivered_playlist_id ?? '');
    if (offerId && deliveredPlaylistId) out[offerId] = { offerId, deliveredPlaylistId };
  }
  return out;
}

async function mapPlaylistTrackRows(rows: any[]): Promise<import('@keep/music').CanonicalTrack[]> {
  return (rows ?? []).map((row: any) => {
    const track = Array.isArray(row.tracks) ? row.tracks[0] : row.tracks;
    return {
      id: String(track.id),
      isrc: track.isrc ? String(track.isrc) : undefined,
      title: String(track.title ?? ''),
      artist: String(track.artist ?? ''),
      album: track.album ? String(track.album) : undefined,
      durationSec: track.duration_sec == null ? undefined : Number(track.duration_sec),
      artworkUrl: track.artwork_url ? String(track.artwork_url) : undefined,
      genres: Array.isArray(track.genres) ? track.genres.map(String) : [],
      providerIds: track.provider_ids && typeof track.provider_ids === 'object' ? track.provider_ids : {},
      previewUrl: track.preview_url ? String(track.preview_url) : undefined,
      availableOn: Array.isArray(track.available_on) ? track.available_on.map(String) : [],
      externalUrls: track.external_urls && typeof track.external_urls === 'object' ? track.external_urls : {},
    };
  });
}

export async function loadDeliveredPlaylistSaleTracks(deliveredPlaylistId: string): Promise<import('@keep/music').CanonicalTrack[]> {
  if (!supabase || !deliveredPlaylistId) return [];
  const { data, error } = await supabase
    .from('playlist_tracks')
    .select('added_at,tracks!inner(id,isrc,title,artist,album,duration_sec,artwork_url,genres,provider_ids,preview_url,available_on,external_urls)')
    .eq('playlist_id', deliveredPlaylistId)
    .order('added_at', { ascending: false });
  if (error) throw error;
  return mapPlaylistTrackRows(data ?? []);
}

export async function loadOwnPlaylistSaleOfferTracks(offerId: string): Promise<import('@keep/music').CanonicalTrack[]> {
  if (!supabase || !offerId) return [];
  const { data, error } = await supabase
    .from('playlist_sale_offer_tracks')
    .select('tracks!inner(id,isrc,title,artist,album,duration_sec,artwork_url,genres,provider_ids,preview_url,available_on,external_urls)')
    .eq('offer_id', offerId);
  if (error) throw error;
  return mapPlaylistTrackRows(data ?? []);
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
export async function setPlaylistSaleOfferForSelection(
  trackIds: string[],
  name: string,
  paymentMode: PlaylistSalePaymentMode,
  amount: number,
  currencyCode = 'EUR',
): Promise<PlaylistSaleOffer> {
  const mode: PlaylistSalePaymentMode = paymentMode === 'FREE' ? 'FREE' : 'MONEY';
  const { data, error } = await client().rpc('keep_playlist_sale_set_offer_for_selection_v3', {
    p_track_ids: trackIds,
    p_name: name,
    p_payment_mode: mode,
    p_price_cents: mode === 'MONEY' ? Math.round(amount) : null,
    p_free_price: mode === 'FREE' ? Math.round(amount) : null,
    p_currency_code: currencyCode,
    p_cover_url: null,
  });
  if (error) throw new Error(String(error.message || 'PLAYLIST_SALE_SELECTION_FAILED'));
  const row = data as any;
  return {
    offerId: String(row?.offerId ?? row?.id ?? ''),
    playlistId: String(row?.playlistId ?? ''),
    playlistName: String(row?.playlistName ?? name),
    paymentMode: (String(row?.paymentMode ?? mode).toUpperCase() === 'FREE' ? 'FREE' : 'MONEY') as PlaylistSalePaymentMode,
    priceCents: Number(row?.priceCents ?? (mode === 'MONEY' ? amount : 0)),
    freePrice: row?.freePrice == null ? (mode === 'FREE' ? Math.round(amount) : null) : Number(row.freePrice),
    currencyCode: String(row?.currencyCode ?? currencyCode),
    coverUrl: null,
    trackCount: Number(row?.trackCount ?? trackIds.length),
    genres: [],
    isActive: true,
    updatedAt: new Date().toISOString(),
  };
}

export async function setPlaylistSalePriceForSelection(trackIds: string[], name: string, priceCents: number, currencyCode = 'EUR', _coverUrl?: string | null): Promise<PlaylistSaleOffer> {
  return setPlaylistSaleOfferForSelection(trackIds, name, 'MONEY', priceCents, currencyCode);
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

// Adel (21/09/2026) : "Popup Public/Masqué post-achat : après paiement,
// choix immédiat 'Rendre publique' / 'Garder masquée'." Le paiement est
// confirmé manuellement par le vendeur (pas de webhook synchrone) -- ce
// choix apparaît donc la prochaine fois que l'app de l'acheteur regarde
// ses achats, pas au moment exact du paiement.
export type PendingVisibilityChoice = {
  paymentId: string;
  playlistId: string;
  sellerUsername: string;
  trackCount: number;
};

export async function loadPendingVisibilityChoice(): Promise<PendingVisibilityChoice | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('keep_playlist_sale_pending_visibility_choice');
  if (error) throw error;
  const row = data as any;
  if (!row?.paymentId) return null;
  return {
    paymentId: String(row.paymentId),
    playlistId: String(row.playlistId ?? ''),
    sellerUsername: String(row.sellerUsername ?? ''),
    trackCount: Number(row.trackCount ?? 0),
  };
}

export async function choosePurchaseVisibility(paymentId: string, isPublic: boolean): Promise<void> {
  const { error } = await client().rpc('keep_playlist_sale_choose_delivered_visibility', { p_payment_id: paymentId, p_public: isPublic });
  if (error) throw new Error(String(error.message || 'PLAYLIST_SALE_VISIBILITY_CHOICE_FAILED'));
}

export async function loadMyPlaylistSaleOffers(): Promise<PlaylistSaleOffer[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('keep_playlist_sale_my_offers');
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    offerId: String(row.offer_id ?? row.offerId ?? ''),
    playlistId: String(row.playlist_id ?? row.playlistId ?? ''),
    playlistName: String(row.playlist_name ?? row.playlistName ?? ''),
    paymentMode: (String(row.payment_mode ?? row.paymentMode ?? 'MONEY').toUpperCase() === 'FREE' ? 'FREE' : 'MONEY') as PlaylistSalePaymentMode,
    priceCents: Number(row.price_cents ?? row.priceCents ?? 0),
    freePrice: row.free_price == null && row.freePrice == null ? null : Number(row.free_price ?? row.freePrice),
    currencyCode: String(row.currency_code ?? row.currencyCode ?? 'EUR'),
    coverUrl: null,
    trackCount: Number(row.track_count ?? row.trackCount ?? 0),
    genres: normalizeSaleGenres(row.genres),
    isActive: Boolean(row.is_active ?? row.isActive),
    updatedAt: String(row.updated_at ?? row.updatedAt ?? ''),
  })).filter((row) => row.playlistId);
}

// Adel (21/09/2026, Partie 4) : "je dois pouvoir ajouter d'autres morceaux
// à cette offre sans devoir tout supprimer et recommencer ... retirer un
// morceau de cette offre sans casser l'offre entière." L'offre garde son
// identité (offerId), son prix et son historique -- seule sa composition
// change.
export type PlaylistSaleAddTracksResult = { offerId: string; addedCount: number; trackCount: number };
export type PlaylistSaleRemoveTrackResult = { offerId: string; trackCount: number; offerClosed: boolean };

export async function addTracksToOffer(offerId: string, trackIds: string[]): Promise<PlaylistSaleAddTracksResult> {
  const { data, error } = await client().rpc('keep_playlist_sale_add_tracks', { p_offer_id: offerId, p_track_ids: trackIds });
  if (error) throw new Error(String(error.message || 'PLAYLIST_SALE_ADD_TRACKS_FAILED'));
  const row = data as any;
  return {
    offerId: String(row?.offerId ?? offerId),
    addedCount: Number(row?.addedCount ?? 0),
    trackCount: Number(row?.trackCount ?? 0),
  };
}

export async function removeTrackFromOffer(offerId: string, trackId: string): Promise<PlaylistSaleRemoveTrackResult> {
  const { data, error } = await client().rpc('keep_playlist_sale_remove_track', { p_offer_id: offerId, p_track_id: trackId });
  if (error) throw new Error(String(error.message || 'PLAYLIST_SALE_REMOVE_TRACK_FAILED'));
  const row = data as any;
  return {
    offerId: String(row?.offerId ?? offerId),
    trackCount: Number(row?.trackCount ?? 0),
    offerClosed: Boolean(row?.offerClosed),
  };
}

// (21/09/2026) Corrige un bug latent : "Changer le prix" recréait toute
// l'offre avec un seul morceau (voir migration 20260921260000) -- cette
// fonction met à jour le prix sans toucher à la composition.
export async function updateOfferPrice(offerId: string, priceCents: number): Promise<void> {
  const { error } = await client().rpc('keep_playlist_sale_update_price', { p_offer_id: offerId, p_price_cents: Math.round(priceCents) });
  if (error) throw new Error(String(error.message || 'PLAYLIST_SALE_UPDATE_PRICE_FAILED'));
}

export async function purchasePlaylistOfferWithFree(offerId: string): Promise<PlaylistDeliveryResult & { freePrice: number; remainingFree: number; alreadyUnlocked: boolean }> {
  const { data, error } = await client().rpc('keep_playlist_sale_purchase_with_free', { p_offer_id: offerId });
  if (error) throw new Error(String(error.message || 'PLAYLIST_FREE_PURCHASE_FAILED'));
  const row = data as any;
  return {
    paymentId: String(row?.paymentId ?? ''),
    buyerId: String(row?.buyerId ?? ''),
    playlistId: String(row?.playlistId ?? ''),
    playlistName: String(row?.playlistName ?? ''),
    trackCount: Number(row?.trackCount ?? 0),
    deliveredAt: String(row?.deliveredAt ?? new Date().toISOString()),
    freePrice: Number(row?.freePrice ?? 0),
    remainingFree: Number(row?.remainingFree ?? 0),
    alreadyUnlocked: Boolean(row?.alreadyUnlocked),
  };
}

export async function updateOfferPaymentMode(
  offerId: string,
  paymentMode: PlaylistSalePaymentMode,
  amount: number,
): Promise<void> {
  const mode: PlaylistSalePaymentMode = paymentMode === 'FREE' ? 'FREE' : 'MONEY';
  const { error } = await client().rpc('keep_playlist_sale_update_payment_mode', {
    p_offer_id: offerId,
    p_payment_mode: mode,
    p_price_cents: mode === 'MONEY' ? Math.round(amount) : null,
    p_free_price: mode === 'FREE' ? Math.round(amount) : null,
  });
  if (error) throw new Error(String(error.message || 'PLAYLIST_SALE_UPDATE_PAYMENT_MODE_FAILED'));
}
