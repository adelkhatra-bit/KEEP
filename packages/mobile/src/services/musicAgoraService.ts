import { supabase } from './supabaseClient';

export type MusicAgoraRoom = {
  slug: string;
  label: string;
  prompt: string;
  sortOrder: number;
};

export type MusicAgoraMessage = {
  id: number;
  roomSlug: string;
  profileId: string;
  username: string;
  avatarUrl: string | null;
  kind: string;
  body: string;
  createdAt: string;
};

export type MusicAgoraReportReason = 'spam' | 'harassment' | 'inappropriate_content' | 'other';

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
  const { data, error } = await supabase.rpc('keep_agora_messages', {
    p_room_slug: roomSlug,
    p_before_id: beforeId ?? null,
    p_limit: limit,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    id: Number(row.id),
    roomSlug: String(row.room_slug || roomSlug),
    profileId: String(row.profile_id || ''),
    username: String(row.username || 'loki-user'),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    kind: String(row.kind || 'USER'),
    body: String(row.body || ''),
    createdAt: String(row.created_at || ''),
  })).filter((row) => row.id && row.profileId && row.body);
}

export async function postMusicAgoraMessage(roomSlug: string, body: string): Promise<number> {
  if (!supabase) throw new Error('service_unavailable');
  const { data, error } = await supabase.rpc('keep_agora_post_message', { p_room_slug: roomSlug, p_body: body });
  if (error) throw error;
  return Number(data || 0);
}

export async function reportMusicAgoraMessage(messageId: number, reason: MusicAgoraReportReason): Promise<void> {
  if (!supabase) throw new Error('service_unavailable');
  const { error } = await supabase.rpc('keep_agora_report_message', { p_message_id: messageId, p_reason: reason });
  if (error) throw error;
}
