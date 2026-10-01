import type { CanonicalTrack } from '@keep/music';
import { supabase } from './supabaseClient';

export type MusicAgoraRoom = {
  slug: string;
  label: string;
  prompt: string;
  sortOrder: number;
};

export type MusicAgoraRevealMode = 'NONE' | 'MASKED' | 'FULL';
export type MusicAgoraPaymentMode = 'NONE' | 'FREE' | 'MONEY';

export type MusicAgoraMessage = {
  id: number;
  roomSlug: string;
  profileId: string;
  username: string;
  avatarUrl: string | null;
  kind: string;
  body: string;
  createdAt: string;
  targetProfileId: string | null;
  targetUsername: string | null;
  sharedTrackId: string | null;
  musicRevealMode: MusicAgoraRevealMode;
  trackTitle: string | null;
  trackArtist: string | null;
  trackArtworkUrl: string | null;
  trackPreviewUrl: string | null;
  saleOfferId: string | null;
  paymentMode: MusicAgoraPaymentMode;
  freePrice: number | null;
  priceCents: number;
  currencyCode: string;
  offerActive: boolean;
  viewerUnlocked: boolean;
  viewerPaymentId: string | null;
  viewerPaymentStatus: 'PENDING' | 'COMPLETED' | null;
  viewerMarkedPaid: boolean;
};

export type MusicAgoraSettings = {
  homeEnabled: boolean;
  notificationsEnabled: boolean;
};

export type MusicAgoraPostOptions = {
  targetProfileId?: string | null;
  sharedTrackId?: string | null;
  revealMode?: MusicAgoraRevealMode;
  paymentMode?: MusicAgoraPaymentMode;
  freePrice?: number | null;
  priceCents?: number | null;
  currencyCode?: string | null;
};

export type MusicAgoraReportReason = 'spam' | 'harassment' | 'inappropriate_content' | 'other';

export async function loadMusicAgoraSettings(): Promise<MusicAgoraSettings> {
  if (!supabase) return { homeEnabled: false, notificationsEnabled: true };
  const { data, error } = await supabase.rpc('keep_agora_my_settings');
  if (error || !data) return { homeEnabled: false, notificationsEnabled: true };
  return {
    homeEnabled: Boolean((data as any).homeEnabled ?? (data as any).home_enabled),
    notificationsEnabled: Boolean((data as any).notificationsEnabled ?? (data as any).notifications_enabled ?? true),
  };
}

export async function saveMusicAgoraSettings(homeEnabled: boolean, notificationsEnabled = true): Promise<MusicAgoraSettings> {
  if (!supabase) throw new Error('service_unavailable');
  const { data, error } = await supabase.rpc('keep_agora_set_settings', {
    p_home_enabled: homeEnabled,
    p_notifications_enabled: notificationsEnabled,
  });
  if (error) throw error;
  return {
    homeEnabled: Boolean((data as any)?.homeEnabled ?? (data as any)?.home_enabled),
    notificationsEnabled: Boolean((data as any)?.notificationsEnabled ?? (data as any)?.notifications_enabled ?? true),
  };
}

export async function setMusicAgoraRoomSubscription(
  roomSlug: string,
  subscribed = true,
  notificationsEnabled = true,
): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('keep_agora_subscribe_room', {
    p_room_slug: roomSlug,
    p_subscribed: subscribed,
    p_notifications_enabled: notificationsEnabled,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function markMusicAgoraRoomRead(roomSlug: string, messageId: number): Promise<void> {
  if (!supabase || !roomSlug || !messageId) return;
  try {
    await supabase.rpc('keep_agora_mark_room_read', {
      p_room_slug: roomSlug,
      p_message_id: messageId,
    });
  } catch {
    // Read receipts are best-effort and must never block the chat.
  }
}

export async function loadMusicAgoraRooms(): Promise<MusicAgoraRoom[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('keep_agora_rooms');
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    slug: String(row.slug || ''),
    label: String(row.label || ''),
    prompt: String(row.prompt || ''),
    sortOrder: Number(row.sort_order || 0),
  })).filter((row) => row.slug && row.label);
}

export async function loadMusicAgoraMessages(roomSlug: string, beforeId?: number, limit = 24): Promise<MusicAgoraMessage[]> {
  if (!supabase || !roomSlug) return [];
  const { data, error } = await supabase.rpc('keep_agora_messages_v4', {
    p_room_slug: roomSlug,
    p_before_id: beforeId ?? null,
    p_limit: limit,
  });
  if (error) throw error;
  const rows = (Array.isArray(data) ? data : []).map((row: any) => ({
    id: Number(row.id),
    roomSlug: String(row.room_slug || roomSlug),
    profileId: String(row.profile_id || ''),
    username: String(row.username || 'loki-user'),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    kind: String(row.kind || 'USER'),
    body: String(row.body || ''),
    createdAt: String(row.created_at || ''),
    targetProfileId: row.target_profile_id ? String(row.target_profile_id) : null,
    targetUsername: row.target_username ? String(row.target_username) : null,
    sharedTrackId: row.shared_track_id ? String(row.shared_track_id) : null,
    musicRevealMode: (['MASKED','FULL'].includes(String(row.music_reveal_mode || '').toUpperCase())
      ? String(row.music_reveal_mode).toUpperCase()
      : 'NONE') as MusicAgoraRevealMode,
    trackTitle: row.track_title ? String(row.track_title) : null,
    trackArtist: row.track_artist ? String(row.track_artist) : null,
    trackArtworkUrl: row.track_artwork_url ? String(row.track_artwork_url) : null,
    trackPreviewUrl: row.track_preview_url ? String(row.track_preview_url) : null,
    saleOfferId: row.sale_offer_id ? String(row.sale_offer_id) : null,
    paymentMode: (['FREE','MONEY'].includes(String(row.payment_mode || '').toUpperCase())
      ? String(row.payment_mode).toUpperCase()
      : 'NONE') as MusicAgoraPaymentMode,
    freePrice: row.free_price == null ? null : Number(row.free_price),
    priceCents: Number(row.price_cents || 0),
    currencyCode: String(row.currency_code || 'EUR'),
    offerActive: Boolean(row.offer_active),
    viewerUnlocked: Boolean(row.viewer_unlocked),
    viewerPaymentId: row.viewer_payment_id ? String(row.viewer_payment_id) : null,
    viewerPaymentStatus: ['PENDING','COMPLETED'].includes(String(row.viewer_payment_status || '').toUpperCase())
      ? String(row.viewer_payment_status).toUpperCase() as 'PENDING' | 'COMPLETED'
      : null,
    viewerMarkedPaid: Boolean(row.viewer_marked_paid),
  })).filter((row) => row.id && row.profileId && row.body);
  if (rows[0]?.id) void markMusicAgoraRoomRead(roomSlug, rows[0].id);
  return rows.sort((a, b) => a.id - b.id);
}

export function subscribeMusicAgoraRoom(roomSlug: string, onChange: () => void): () => void {
  if (!supabase || !roomSlug) return () => {};
  const channel = supabase
    .channel(`keep-agora:${roomSlug}:${Date.now()}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'music_agora_messages', filter: `room_slug=eq.${roomSlug}` },
      () => onChange(),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function postMusicAgoraMessage(
  roomSlug: string,
  body: string,
  options: MusicAgoraPostOptions = {},
): Promise<number> {
  if (!supabase) throw new Error('service_unavailable');
  const { data, error } = await supabase.rpc('keep_agora_post_message_v3', {
    p_room_slug: roomSlug,
    p_body: body,
    p_target_profile_id: options.targetProfileId ?? null,
    p_shared_track_id: options.sharedTrackId ?? null,
    p_reveal_mode: options.revealMode ?? 'NONE',
    p_payment_mode: options.paymentMode ?? 'NONE',
    p_free_price: options.freePrice ?? null,
    p_price_cents: options.priceCents ?? null,
    p_currency_code: options.currencyCode ?? 'EUR',
  });
  if (error) throw error;
  return Number((data as any)?.messageId ?? (data as any)?.message_id ?? data ?? 0);
}

export async function loadMusicAgoraSharedTrack(trackId: string): Promise<CanonicalTrack | null> {
  if (!supabase || !trackId) return null;
  const { data, error } = await supabase
    .from('tracks')
    .select('id,isrc,title,artist,album,artwork_url,preview_url,genres,provider_ids,external_urls,available_on,release_year')
    .eq('id', trackId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: String((data as any).id),
    isrc: (data as any).isrc || undefined,
    title: String((data as any).title || ''),
    artist: String((data as any).artist || ''),
    album: (data as any).album || undefined,
    artworkUrl: (data as any).artwork_url || undefined,
    previewUrl: (data as any).preview_url || undefined,
    genres: Array.isArray((data as any).genres) ? (data as any).genres : [],
    providerIds: (data as any).provider_ids || {},
    externalUrls: (data as any).external_urls || {},
    availableOn: Array.isArray((data as any).available_on) ? (data as any).available_on : [],
    releaseYear: (data as any).release_year || undefined,
  } as CanonicalTrack;
}

export async function reportMusicAgoraMessage(messageId: number, reason: MusicAgoraReportReason): Promise<void> {
  if (!supabase) throw new Error('service_unavailable');
  const { error } = await supabase.rpc('keep_agora_report_message', { p_message_id: messageId, p_reason: reason });
  if (error) throw error;
}
