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
  targetOwnsTrack: boolean;
  viewerOwnsTrack: boolean;
  senderCanResell: boolean;
  discoveredByUsername: string | null;
  replyToMessageId?: number | null;
  replyToUsername?: string | null;
  replyToBody?: string | null;
};

export type MusicAgoraConversation = {
  profileId: string;
  username: string;
  avatarUrl: string | null;
  lastMessageId: number;
  lastRoomSlug: string;
  lastBody: string;
  lastCreatedAt: string;
  lastSharedTrackId: string | null;
  lastSaleOfferId: string | null;
};

export type MusicAgoraGroup = {
  id: string;
  name: string;
  ownerId: string;
  ownerUsername: string;
  myRole: 'OWNER' | 'MEMBER';
  myStatus: 'INVITED' | 'ACTIVE';
  memberCount: number;
  invitedCount: number;
  lastMessageId: number | null;
  lastBody: string;
  lastCreatedAt: string | null;
};

export type MusicAgoraGroupPerson = {
  profileId: string;
  username: string;
  avatarUrl: string | null;
};

export type MusicAgoraGroupMember = MusicAgoraGroupPerson & {
  role: 'OWNER' | 'MEMBER';
  status: 'INVITED' | 'ACTIVE';
};

export type MusicAgoraSharePreflight = {
  hasTrack: boolean;
  canSell: boolean;
  sourceProfileId: string | null;
  sourceUsername: string | null;
  reason: 'TRACK_NOT_IN_YOUR_MUSIC' | 'ACQUIRED_FROM_ANOTHER_USER' | 'OWN_DISCOVERY' | string;
  targetProfileId: string | null;
  targetUsername: string | null;
  targetOwnsTrack: boolean;
};

export type MusicAgoraSurface = 'LISTEN' | 'DISCOVER' | 'PLAYLISTS' | 'PARTIES' | 'PROFILE' | 'NOTIFICATIONS';

export type MusicAgoraSettings = {
  homeEnabled: boolean;
  notificationsEnabled: boolean;
  voiceAnnouncementsEnabled: boolean;
  surfaces: MusicAgoraSurface[];
  side: 'left' | 'right';
  bottomOffset: number;
};

export type MusicAgoraPostOptions = {
  targetProfileId?: string | null;
  sharedTrackId?: string | null;
  revealMode?: MusicAgoraRevealMode;
  paymentMode?: MusicAgoraPaymentMode;
  freePrice?: number | null;
  priceCents?: number | null;
  currencyCode?: string | null;
  replyToMessageId?: number | null;
};

export type MusicAgoraReportReason = 'spam' | 'harassment' | 'inappropriate_content' | 'other';

const ALL_CHAT_SURFACES: MusicAgoraSurface[] = ['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE','NOTIFICATIONS'];
export const MARKETPLACE_PAYMENT_TERMS_VERSION = '2026-10-01-chat-payments-v1';
const PAYPAL_QR_PREFIXES = ['[[LOKI_PAYPAL_QR]]', '[[KEEP_PAYPAL_QR]]'] as const;

export function extractMusicAgoraPayoutQrUrl(body: string): string | null {
  const raw = String(body || '');
  const prefix = PAYPAL_QR_PREFIXES.find((value) => raw.startsWith(value));
  if (!prefix) return null;
  const candidate = raw.slice(prefix.length).trim();
  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    const isKeepSupabase = host === 'rrhqsqzcplvmwxizqnla.supabase.co';
    const isPublicAvatarObject = path.includes('/storage/v1/object/public/avatars/');
    const isPayoutQr = /\/payout-qr\.(png|jpe?g|webp)$/i.test(path);
    if (url.protocol !== 'https:' || !isKeepSupabase || !isPublicAvatarObject || !isPayoutQr) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function musicAgoraBodyPreview(body: string): string {
  return extractMusicAgoraPayoutQrUrl(body) ? 'QR PayPal partagé' : String(body || '');
}

async function hydrateMusicAgoraPaymentStates(rows: MusicAgoraMessage[]): Promise<MusicAgoraMessage[]> {
  if (!supabase) return rows;
  const offerIds = Array.from(new Set(rows.map((row) => row.saleOfferId).filter((id): id is string => Boolean(id))));
  if (!offerIds.length) return rows;
  const { data, error } = await supabase.rpc('keep_agora_offer_payment_states', { p_offer_ids: offerIds });
  if (error || !Array.isArray(data)) return rows;
  const byOffer = new Map<string, any>();
  for (const item of data as any[]) {
    const offerId = String(item?.offerId ?? item?.offer_id ?? '');
    if (offerId) byOffer.set(offerId, item);
  }
  return rows.map((row) => {
    if (!row.saleOfferId) return row;
    const state = byOffer.get(row.saleOfferId);
    if (!state) return row;
    const status = String(state?.status || '').toUpperCase();
    return {
      ...row,
      viewerPaymentId: String(state?.paymentId ?? state?.payment_id ?? row.viewerPaymentId ?? '') || null,
      viewerPaymentStatus: status === 'COMPLETED' ? 'COMPLETED' : status === 'PENDING' ? 'PENDING' : row.viewerPaymentStatus,
      viewerMarkedPaid: Boolean(state?.buyerMarkedPaidAt ?? state?.buyer_marked_paid_at ?? row.viewerMarkedPaid),
      viewerUnlocked: status === 'COMPLETED' || row.viewerUnlocked,
    };
  });
}

export async function loadMarketplacePaymentTermsAccepted(): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('keep_marketplace_terms_status', {
    p_version: MARKETPLACE_PAYMENT_TERMS_VERSION,
  });
  if (error) return false;
  return Boolean(data);
}

export async function acceptMarketplacePaymentTerms(source = 'chat'): Promise<boolean> {
  if (!supabase) throw new Error('service_unavailable');
  const { error } = await supabase.rpc('keep_marketplace_accept_terms', {
    p_version: MARKETPLACE_PAYMENT_TERMS_VERSION,
    p_source: source,
  });
  if (error) throw error;
  return true;
}

export async function shareMyPayoutQrInAgora(roomSlug: string, targetProfileId: string): Promise<number> {
  if (!supabase) throw new Error('service_unavailable');
  const { data, error } = await supabase.rpc('keep_agora_share_my_payout_qr', {
    p_room_slug: roomSlug,
    p_target_profile_id: targetProfileId,
  });
  if (error) throw error;
  return Number(data || 0);
}

function parseChatSurfaces(value: unknown): MusicAgoraSurface[] {
  if (!Array.isArray(value)) return ALL_CHAT_SURFACES;
  const allowed = new Set(ALL_CHAT_SURFACES);
  const parsed = value.map((v) => String(v || '').toUpperCase()).filter((v): v is MusicAgoraSurface => allowed.has(v as MusicAgoraSurface));
  return parsed.length ? Array.from(new Set(parsed)) : ['PROFILE'];
}

export async function loadMusicAgoraSettings(): Promise<MusicAgoraSettings> {
  const fallbackDefault: MusicAgoraSettings = { homeEnabled: false, notificationsEnabled: true, voiceAnnouncementsEnabled: false, surfaces: ALL_CHAT_SURFACES, side: 'right', bottomOffset: 88 };
  if (!supabase) return fallbackDefault;

  const { data, error } = await supabase.rpc('keep_agora_my_settings');
  if (!error && data) {
    return {
      homeEnabled: Boolean((data as any).homeEnabled ?? (data as any).home_enabled ?? (data as any).enabled),
      notificationsEnabled: Boolean((data as any).notificationsEnabled ?? (data as any).notifications_enabled ?? true),
      voiceAnnouncementsEnabled: Boolean((data as any).voiceAnnouncementsEnabled ?? (data as any).voice_announcements_enabled ?? (data as any).voiceAnnouncements ?? (data as any).voice_announcements ?? false),
      surfaces: parseChatSurfaces((data as any).surfaces ?? (data as any).visibleSurfaces ?? (data as any).visible_surfaces),
      side: String((data as any).side || '').toLowerCase() === 'left' ? 'left' : 'right',
      bottomOffset: Math.max(72, Math.min(800, Number((data as any).bottomOffset ?? (data as any).bottom_offset ?? 88) || 88)),
    };
  }

  // Ne jamais masquer le Tchat à tout le monde parce qu'un RPC de réglages
  // a eu une erreur transitoire. Le profil authentifié contient les mêmes
  // préférences et reste lisible par son propriétaire via RLS.
  const { data: sessionData } = await supabase.auth.getSession();
  const profileId = sessionData.session?.user?.id;
  if (!profileId) return fallbackDefault;
  const direct = await supabase
    .from('profiles')
    .select('community_chat_enabled,community_chat_home_enabled,community_chat_notifications,community_chat_voice_announcements,community_chat_surfaces,community_chat_side,community_chat_bottom_offset')
    .eq('id', profileId)
    .maybeSingle();
  if (direct.error || !direct.data) return fallbackDefault;
  const row = direct.data as any;
  return {
    homeEnabled: Boolean(row.community_chat_enabled ?? row.community_chat_home_enabled),
    notificationsEnabled: Boolean(row.community_chat_notifications ?? true),
    voiceAnnouncementsEnabled: Boolean(row.community_chat_voice_announcements ?? false),
    surfaces: parseChatSurfaces(row.community_chat_surfaces),
    side: String(row.community_chat_side || '').toLowerCase() === 'left' ? 'left' : 'right',
    bottomOffset: Math.max(72, Math.min(800, Number(row.community_chat_bottom_offset ?? 88) || 88)),
  };
}

export async function saveMusicAgoraSettings(
  homeEnabled: boolean,
  notificationsEnabled = true,
  surfaces: MusicAgoraSurface[] = ALL_CHAT_SURFACES,
): Promise<MusicAgoraSettings> {
  if (!supabase) throw new Error('service_unavailable');
  const { data, error } = await supabase.rpc('keep_agora_set_settings_v2', {
    p_home_enabled: homeEnabled,
    p_notifications_enabled: notificationsEnabled,
    p_surfaces: parseChatSurfaces(surfaces),
  });
  if (error) throw error;
  return {
    homeEnabled: Boolean((data as any)?.homeEnabled ?? (data as any)?.home_enabled),
    notificationsEnabled: Boolean((data as any)?.notificationsEnabled ?? (data as any)?.notifications_enabled ?? true),
    voiceAnnouncementsEnabled: Boolean((data as any)?.voiceAnnouncementsEnabled ?? (data as any)?.voice_announcements_enabled ?? (data as any)?.voiceAnnouncements ?? (data as any)?.voice_announcements ?? false),
    surfaces: parseChatSurfaces((data as any)?.surfaces ?? (data as any)?.visibleSurfaces ?? (data as any)?.visible_surfaces),
    side: String((data as any)?.side || '').toLowerCase() === 'left' ? 'left' : 'right',
    bottomOffset: Math.max(72, Math.min(800, Number((data as any)?.bottomOffset ?? (data as any)?.bottom_offset ?? 88) || 88)),
  };
}

export async function saveMusicAgoraPosition(side: 'left' | 'right', bottomOffset: number): Promise<MusicAgoraSettings> {
  if (!supabase) throw new Error('service_unavailable');
  const { data, error } = await supabase.rpc('keep_agora_set_position', {
    p_side: side,
    p_bottom_offset: Math.max(72, Math.min(800, Math.round(bottomOffset))),
  });
  if (error) throw error;
  return {
    homeEnabled: Boolean((data as any)?.homeEnabled ?? (data as any)?.home_enabled ?? (data as any)?.enabled),
    notificationsEnabled: Boolean((data as any)?.notificationsEnabled ?? (data as any)?.notifications_enabled ?? true),
    voiceAnnouncementsEnabled: Boolean((data as any)?.voiceAnnouncementsEnabled ?? (data as any)?.voice_announcements_enabled ?? (data as any)?.voiceAnnouncements ?? (data as any)?.voice_announcements ?? false),
    surfaces: parseChatSurfaces((data as any)?.surfaces ?? (data as any)?.visibleSurfaces ?? (data as any)?.visible_surfaces),
    side: String((data as any)?.side || '').toLowerCase() === 'left' ? 'left' : 'right',
    bottomOffset: Math.max(72, Math.min(800, Number((data as any)?.bottomOffset ?? (data as any)?.bottom_offset ?? bottomOffset) || bottomOffset)),
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
  const { data, error } = await supabase.rpc('keep_agora_messages_v6', {
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
    targetOwnsTrack: Boolean(row.target_owns_track),
    viewerOwnsTrack: Boolean(row.viewer_owns_track),
    senderCanResell: Boolean(row.sender_can_resell),
    discoveredByUsername: row.discovered_by_username ? String(row.discovered_by_username) : null,
    replyToMessageId: row.reply_to_message_id == null ? null : Number(row.reply_to_message_id),
    replyToUsername: row.reply_to_username ? String(row.reply_to_username) : null,
    replyToBody: row.reply_to_body ? String(row.reply_to_body) : null,
  })).filter((row) => row.id && row.profileId && row.body);
  const hydrated = await hydrateMusicAgoraPaymentStates(rows);
  if (hydrated[0]?.id) void markMusicAgoraRoomRead(roomSlug, hydrated[0].id);
  return hydrated.sort((a, b) => a.id - b.id);
}

export async function loadMusicAgoraConversations(limit = 30): Promise<MusicAgoraConversation[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('keep_agora_my_conversations', { p_limit: limit });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    profileId: String(row.other_profile_id || ''),
    username: String(row.other_username || 'loki-user'),
    avatarUrl: row.other_avatar_url ? String(row.other_avatar_url) : null,
    lastMessageId: Number(row.last_message_id || 0),
    lastRoomSlug: String(row.last_room_slug || 'place'),
    lastBody: musicAgoraBodyPreview(String(row.last_body || '')),
    lastCreatedAt: String(row.last_created_at || ''),
    lastSharedTrackId: row.last_shared_track_id ? String(row.last_shared_track_id) : null,
    lastSaleOfferId: row.last_sale_offer_id ? String(row.last_sale_offer_id) : null,
  })).filter((row) => row.profileId && row.lastMessageId)
    .sort((a, b) => {
      const timeDiff = new Date(b.lastCreatedAt || 0).getTime() - new Date(a.lastCreatedAt || 0).getTime();
      return timeDiff || b.lastMessageId - a.lastMessageId;
    });
}

export async function loadMusicAgoraDirectMessages(
  otherProfileId: string,
  beforeId?: number,
  limit = 30,
): Promise<MusicAgoraMessage[]> {
  if (!supabase || !otherProfileId) return [];
  const { data, error } = await supabase.rpc('keep_agora_direct_messages_v2', {
    p_other_profile_id: otherProfileId,
    p_before_id: beforeId ?? null,
    p_limit: limit,
  });
  if (error) throw error;
  const rows = (Array.isArray(data) ? data : []).map((row: any) => ({
    id: Number(row.id),
    roomSlug: String(row.room_slug || 'place'),
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
    targetOwnsTrack: Boolean(row.target_owns_track),
    viewerOwnsTrack: Boolean(row.viewer_owns_track),
    senderCanResell: Boolean(row.sender_can_resell),
    discoveredByUsername: row.discovered_by_username ? String(row.discovered_by_username) : null,
    replyToMessageId: row.reply_to_message_id == null ? null : Number(row.reply_to_message_id),
    replyToUsername: row.reply_to_username ? String(row.reply_to_username) : null,
    replyToBody: row.reply_to_body ? String(row.reply_to_body) : null,
  })).filter((row) => row.id && row.profileId && row.body);
  const hydrated = await hydrateMusicAgoraPaymentStates(rows);
  return hydrated.sort((a, b) => a.id - b.id);
}

// Adel (02/10/2026) : « quand quelqu'un commence à m'écrire, une petite
// languette me dit qu'il est en train d'écrire ». Signal éphémère Realtime
// (broadcast), rien n'est enregistré en base. Canal = destinataire.
export type MusicAgoraTypingSignal = {
  fromId: string;
  fromUsername: string;
  key: string; // conversation chez le DESTINATAIRE : p:<expéditeur> ou g:<groupe>
  groupName?: string | null;
};

export function subscribeMusicAgoraTyping(profileId: string, onTyping: (signal: MusicAgoraTypingSignal) => void): () => void {
  if (!supabase || !profileId) return () => {};
  const client = supabase;
  const channel = client
    .channel(`keep-agora-typing:${profileId}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'typing' }, (message: any) => {
      const p = message?.payload ?? {};
      if (!p.fromId || p.fromId === profileId) return;
      onTyping({ fromId: String(p.fromId), fromUsername: String(p.fromUsername || 'quelqu’un'), key: String(p.key || ''), groupName: p.groupName ? String(p.groupName) : null });
    })
    .subscribe();
  return () => { void client.removeChannel(channel); };
}

export async function sendMusicAgoraTyping(targetProfileIds: string[], signal: MusicAgoraTypingSignal): Promise<void> {
  if (!supabase) return;
  const client = supabase;
  const targets = [...new Set(targetProfileIds.filter((id) => id && id !== signal.fromId))].slice(0, 30);
  await Promise.all(targets.map(async (id) => {
    const channel = client.channel(`keep-agora-typing:${id}`, { config: { broadcast: { self: false } } });
    try { await (channel as any).httpSend('typing', signal); } catch { /* signal facultatif */ }
    finally { void client.removeChannel(channel); }
  }));
}

export function subscribeMusicAgoraRoom(roomSlug: string, onChange: () => void): () => void {
  if (!supabase || !roomSlug) return () => {};
  const client = supabase;
  const channel = client
    .channel(`keep-agora:${roomSlug}:${Date.now()}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'music_agora_messages', filter: `room_slug=eq.${roomSlug}` },
      () => onChange(),
    )
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}

export function subscribeMusicAgoraDirect(
  currentProfileId: string,
  otherProfileId: string,
  onChange: () => void,
): () => void {
  if (!supabase || !currentProfileId || !otherProfileId) return () => {};
  const client = supabase;
  const channel = client
    .channel(`keep-agora-direct:${currentProfileId}:${otherProfileId}:${Date.now()}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'music_agora_messages', filter: `target_profile_id=eq.${currentProfileId}` },
      (payload) => {
        const row = (payload as any)?.new ?? {};
        if (String(row.profile_id || '') === otherProfileId) onChange();
      },
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'music_agora_messages', filter: `target_profile_id=eq.${otherProfileId}` },
      (payload) => {
        // Synchronise aussi un autre appareil connecté au même compte :
        // un message envoyé ailleurs apparaît sans fermer/réouvrir le fil.
        const row = (payload as any)?.new ?? {};
        if (String(row.profile_id || '') === currentProfileId) onChange();
      },
    )
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}

export function subscribeMusicAgoraGroup(groupId: string, onChange: () => void): () => void {
  if (!supabase || !groupId) return () => {};
  const client = supabase;
  const channel = client
    .channel(`keep-agora-group:${groupId}:${Date.now()}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'music_agora_group_messages', filter: `group_id=eq.${groupId}` },
      () => onChange(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'music_agora_group_members', filter: `group_id=eq.${groupId}` },
      () => onChange(),
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

export function subscribeMusicAgoraMembership(profileId: string, onChange: () => void): () => void {
  if (!supabase || !profileId) return () => {};
  const client = supabase;
  const channel = client
    .channel(`keep-agora-membership:${profileId}:${Date.now()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'music_agora_group_members', filter: `profile_id=eq.${profileId}` },
      () => onChange(),
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

export async function postMusicAgoraMessage(
  roomSlug: string,
  body: string,
  options: MusicAgoraPostOptions = {},
): Promise<number> {
  if (!supabase) throw new Error('service_unavailable');
  const { data, error } = await supabase.rpc('keep_agora_post_message_v5', {
    p_room_slug: roomSlug,
    p_body: body,
    p_target_profile_id: options.targetProfileId ?? null,
    p_shared_track_id: options.sharedTrackId ?? null,
    p_reveal_mode: options.revealMode ?? 'NONE',
    p_payment_mode: options.paymentMode ?? 'NONE',
    p_free_price: options.freePrice ?? null,
    p_price_cents: options.priceCents ?? null,
    p_currency_code: options.currencyCode ?? 'EUR',
    p_reply_to_message_id: options.replyToMessageId ?? null,
  });
  if (error) throw error;
  return Number((data as any)?.messageId ?? (data as any)?.message_id ?? data ?? 0);
}

export async function loadMusicAgoraSharePreflight(
  trackId: string,
  targetProfileId?: string | null,
): Promise<MusicAgoraSharePreflight> {
  if (!supabase || !trackId) {
    return {
      hasTrack: false,
      canSell: false,
      sourceProfileId: null,
      sourceUsername: null,
      reason: 'TRACK_NOT_IN_YOUR_MUSIC',
      targetProfileId: targetProfileId ?? null,
      targetUsername: null,
      targetOwnsTrack: false,
    };
  }
  const { data, error } = await supabase.rpc('keep_agora_share_preflight', {
    p_track_id: trackId,
    p_target_profile_id: targetProfileId ?? null,
  });
  if (error) throw error;
  const row = (data ?? {}) as any;
  return {
    hasTrack: Boolean(row.hasTrack ?? row.has_track),
    canSell: Boolean(row.canSell ?? row.can_sell),
    sourceProfileId: row.sourceProfileId ?? row.source_profile_id ?? null,
    sourceUsername: row.sourceUsername ?? row.source_username ?? null,
    reason: String(row.reason || ''),
    targetProfileId: row.targetProfileId ?? row.target_profile_id ?? targetProfileId ?? null,
    targetUsername: row.targetUsername ?? row.target_username ?? null,
    targetOwnsTrack: Boolean(row.targetOwnsTrack ?? row.target_owns_track),
  };
}

export type MusicAgoraTrackSaleEligibility = {
  hasTrack: boolean;
  canSell: boolean;
  sourceProfileId: string | null;
  sourceUsername: string | null;
  reason: string;
};

export type MusicAgoraShareableTrack = {
  track: CanonicalTrack;
  sourceProfileId: string | null;
  sourceUsername: string | null;
  canSell: boolean;
};

export async function profileAlreadyOwnsAgoraTrack(profileId: string, trackId: string): Promise<boolean> {
  if (!supabase || !profileId || !trackId) return false;
  const { data, error } = await supabase.rpc('keep_profile_has_track', {
    p_profile_id: profileId,
    p_track_id: trackId,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function loadMusicAgoraTrackSaleEligibility(trackId: string): Promise<MusicAgoraTrackSaleEligibility> {
  if (!supabase || !trackId) return { hasTrack: false, canSell: false, sourceProfileId: null, sourceUsername: null, reason: 'UNKNOWN' };
  const { data, error } = await supabase.rpc('keep_agora_my_track_sale_eligibility', { p_track_id: trackId });
  if (error) throw error;
  const row = data && typeof data === 'object' ? data as any : {};
  return {
    hasTrack: Boolean(row.hasTrack ?? row.has_track),
    canSell: Boolean(row.canSell ?? row.can_sell),
    sourceProfileId: row.sourceProfileId ?? row.source_profile_id ?? null,
    sourceUsername: row.sourceUsername ?? row.source_username ?? null,
    reason: String(row.reason || ''),
  };
}

export async function loadMusicAgoraShareableTracks(limit = 120): Promise<MusicAgoraShareableTrack[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('keep_agora_my_shareable_tracks', { p_limit: limit });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    track: {
      id: String(row.id),
      isrc: row.isrc || undefined,
      title: String(row.title || ''),
      artist: String(row.artist || ''),
      album: row.album || undefined,
      artworkUrl: row.artwork_url || undefined,
      previewUrl: row.preview_url || undefined,
      genres: Array.isArray(row.genres) ? row.genres : [],
      providerIds: row.provider_ids || {},
      externalUrls: row.external_urls || {},
      availableOn: Array.isArray(row.available_on) ? row.available_on : [],
      releaseYear: row.release_year || undefined,
    } as CanonicalTrack,
    sourceProfileId: row.source_profile_id ? String(row.source_profile_id) : null,
    sourceUsername: row.source_username ? String(row.source_username) : null,
    canSell: Boolean(row.can_sell),
  })).filter((row) => row.track.id && row.track.title && row.track.artist);
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

export type MusicAgoraGroupOfferResult = { groupMessageId: number | null; offersSent: number; alreadyOwned: number; alreadyPending: number };

// Adel (02/10/2026) : vente dans un groupe = une offre privée par membre actif
// (même circuit FREE / PayPal + QR que la vente privée). Ceux qui ont déjà le
// morceau ne reçoivent rien à payer.
export async function postMusicAgoraGroupOffer(
  groupId: string,
  body: string,
  options: { sharedTrackId: string; paymentMode: 'FREE' | 'MONEY'; freePrice?: number | null; priceCents?: number | null; currencyCode?: string; replyToMessageId?: number | null },
): Promise<MusicAgoraGroupOfferResult> {
  if (!supabase) throw new Error('service_unavailable');
  const { data, error } = await supabase.rpc('keep_agora_post_group_offer', {
    p_group_id: groupId,
    p_body: body,
    p_shared_track_id: options.sharedTrackId,
    p_payment_mode: options.paymentMode,
    p_free_price: options.freePrice ?? null,
    p_price_cents: options.priceCents ?? null,
    p_currency_code: options.currencyCode ?? 'EUR',
    p_reply_to_message_id: options.replyToMessageId ?? null,
  });
  if (error) throw error;
  const row = (data ?? {}) as any;
  return {
    groupMessageId: row.groupMessageId == null ? null : Number(row.groupMessageId),
    offersSent: Number(row.offersSent || 0),
    alreadyOwned: Number(row.alreadyOwned || 0),
    alreadyPending: Number(row.alreadyPending || 0),
  };
}

// Les messages de groupe ont leur propre table : un id de groupe envoyé à
// keep_agora_report_message visait un AUTRE message (La Place / privé).
// Chaque signalement alerte le Super Admin côté serveur (ADMIN_USER_REPORT).
export async function reportMusicAgoraMessage(messageId: number, reason: MusicAgoraReportReason, groupId?: string | null): Promise<void> {
  if (!supabase) throw new Error('service_unavailable');
  const { error } = groupId
    ? await supabase.rpc('keep_agora_report_group_message', { p_message_id: messageId, p_reason: reason })
    : await supabase.rpc('keep_agora_report_message', { p_message_id: messageId, p_reason: reason });
  if (error) throw error;
}


export async function saveMusicAgoraVoiceAnnouncements(enabled: boolean): Promise<boolean> {
  if (!supabase) throw new Error('service_unavailable');
  const { data, error } = await supabase.rpc('keep_agora_set_voice_announcements', {
    p_enabled: Boolean(enabled),
  });
  if (error) throw error;
  const row = data as any;
  return Boolean(
    row?.voiceAnnouncementsEnabled
    ?? row?.voice_announcements_enabled
    ?? row?.voiceAnnouncements
    ?? row?.voice_announcements
    ?? false
  );
}


export async function loadMusicAgoraGroups(): Promise<MusicAgoraGroup[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('keep_agora_my_groups');
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any): MusicAgoraGroup => ({
    id: String(row.group_id || ''),
    name: String(row.group_name || 'Conversation'),
    ownerId: String(row.owner_id || ''),
    ownerUsername: String(row.owner_username || 'loki-user'),
    myRole: String(row.my_role || 'MEMBER').toUpperCase() === 'OWNER' ? 'OWNER' : 'MEMBER',
    myStatus: String(row.my_status || 'INVITED').toUpperCase() === 'ACTIVE' ? 'ACTIVE' : 'INVITED',
    memberCount: Number(row.member_count || 0),
    invitedCount: Number(row.invited_count || 0),
    lastMessageId: row.last_message_id == null ? null : Number(row.last_message_id),
    lastBody: musicAgoraBodyPreview(String(row.last_body || '')),
    lastCreatedAt: row.last_created_at ? String(row.last_created_at) : null,
  })).filter((row) => row.id)
    .sort((a, b) => {
      const timeDiff = new Date(b.lastCreatedAt || 0).getTime() - new Date(a.lastCreatedAt || 0).getTime();
      return timeDiff || Number(b.lastMessageId || 0) - Number(a.lastMessageId || 0);
    });
}

export async function searchMusicAgoraGroupPeople(query = '', limit = 30): Promise<MusicAgoraGroupPerson[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('keep_agora_group_people_search', {
    p_query: String(query || ''),
    p_limit: Math.max(1, Math.min(60, limit)),
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    profileId: String(row.profile_id || ''),
    username: String(row.username || 'loki-user'),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
  })).filter((row) => row.profileId);
}

export async function createMusicAgoraGroup(name: string, memberIds: string[]): Promise<string> {
  if (!supabase) throw new Error('service_unavailable');
  const uniqueIds = [...new Set(memberIds.filter(Boolean))].slice(0, 44);
  const { data, error } = await supabase.rpc('keep_agora_create_group', {
    p_name: String(name || '').trim(),
    p_member_ids: uniqueIds,
  });
  if (error) throw error;
  return String(data || '');
}

export async function acceptMusicAgoraGroup(groupId: string): Promise<void> {
  if (!supabase) throw new Error('service_unavailable');
  const { error } = await supabase.rpc('keep_agora_accept_group', { p_group_id: groupId });
  if (error) throw error;
}

export async function declineMusicAgoraGroup(groupId: string): Promise<void> {
  if (!supabase) throw new Error('service_unavailable');
  const { error } = await supabase.rpc('keep_agora_decline_group', { p_group_id: groupId });
  if (error) throw error;
}

export async function loadMusicAgoraGroupMembers(groupId: string): Promise<MusicAgoraGroupMember[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('keep_agora_group_members', { p_group_id: groupId });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any): MusicAgoraGroupMember => ({
    profileId: String(row.profile_id || ''),
    username: String(row.username || 'loki-user'),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    role: String(row.role || 'MEMBER').toUpperCase() === 'OWNER' ? 'OWNER' : 'MEMBER',
    status: String(row.status || 'INVITED').toUpperCase() === 'ACTIVE' ? 'ACTIVE' : 'INVITED',
  })).filter((row) => row.profileId);
}

export async function inviteMusicAgoraGroupMember(groupId: string, profileId: string): Promise<void> {
  if (!supabase) throw new Error('service_unavailable');
  const { error } = await supabase.rpc('keep_agora_invite_group_member', {
    p_group_id: groupId,
    p_profile_id: profileId,
  });
  if (error) throw error;
}

// Adel (02/10/2026) : le créateur peut supprimer le groupe pour tout le monde.
// Suppression douce côté serveur (messages conservés), chaque membre notifié.
export async function deleteMusicAgoraGroup(groupId: string): Promise<void> {
  if (!supabase) throw new Error('service_unavailable');
  const { error } = await supabase.rpc('keep_agora_delete_group', { p_group_id: groupId });
  if (error) throw error;
}

export async function removeMusicAgoraGroupMember(groupId: string, profileId: string): Promise<void> {
  if (!supabase) throw new Error('service_unavailable');
  const { error } = await supabase.rpc('keep_agora_remove_group_member', {
    p_group_id: groupId,
    p_profile_id: profileId,
  });
  if (error) throw error;
}

export async function loadMusicAgoraGroupMessages(
  groupId: string,
  beforeId?: number,
  limit = 30,
): Promise<MusicAgoraMessage[]> {
  if (!supabase || !groupId) return [];
  const { data, error } = await supabase.rpc('keep_agora_group_messages_v2', {
    p_group_id: groupId,
    p_before_id: beforeId ?? null,
    p_limit: limit,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any): MusicAgoraMessage => ({
    id: Number(row.id),
    roomSlug: `group:${groupId}`,
    profileId: String(row.profile_id || ''),
    username: String(row.username || 'loki-user'),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    kind: 'USER',
    body: String(row.body || ''),
    createdAt: String(row.created_at || ''),
    targetProfileId: null,
    targetUsername: null,
    sharedTrackId: row.shared_track_id ? String(row.shared_track_id) : null,
    musicRevealMode: (['MASKED','FULL'].includes(String(row.music_reveal_mode || '').toUpperCase())
      ? String(row.music_reveal_mode).toUpperCase()
      : 'NONE') as MusicAgoraRevealMode,
    trackTitle: row.track_title ? String(row.track_title) : null,
    trackArtist: row.track_artist ? String(row.track_artist) : null,
    trackArtworkUrl: row.track_artwork_url ? String(row.track_artwork_url) : null,
    trackPreviewUrl: row.track_preview_url ? String(row.track_preview_url) : null,
    saleOfferId: null,
    paymentMode: 'NONE',
    freePrice: null,
    priceCents: 0,
    currencyCode: 'EUR',
    offerActive: false,
    viewerUnlocked: false,
    viewerPaymentId: null,
    viewerPaymentStatus: null,
    viewerMarkedPaid: false,
    targetOwnsTrack: false,
    viewerOwnsTrack: false,
    senderCanResell: false,
    discoveredByUsername: null,
    replyToMessageId: row.reply_to_message_id == null ? null : Number(row.reply_to_message_id),
    replyToUsername: row.reply_to_username ? String(row.reply_to_username) : null,
    replyToBody: row.reply_to_body ? String(row.reply_to_body) : null,
  })).filter((row) => row.id && row.profileId).sort((a, b) => a.id - b.id);
}

export async function postMusicAgoraGroupMessage(
  groupId: string,
  body: string,
  options: Pick<MusicAgoraPostOptions, 'sharedTrackId' | 'revealMode' | 'replyToMessageId'> = {},
): Promise<number> {
  if (!supabase) throw new Error('service_unavailable');
  const { data, error } = await supabase.rpc('keep_agora_post_group_message_v2', {
    p_group_id: groupId,
    p_body: String(body || ''),
    p_shared_track_id: options.sharedTrackId ?? null,
    p_reveal_mode: options.revealMode ?? 'NONE',
    p_reply_to_message_id: options.replyToMessageId ?? null,
  });
  if (error) throw error;
  return Number(data || 0);
}
