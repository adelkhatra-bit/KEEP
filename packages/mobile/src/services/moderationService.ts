import { supabase } from './supabaseClient';

/**
 * Signaler + bloquer un utilisateur (exigence Apple Guideline 1.2 pour tout
 * contenu genere par les utilisateurs -- profils publics, morceaux partages,
 * Battle). Cote serveur : supabase/migrations/20260831180000_user_moderation_block_report.sql
 * (RPC block_user/unblock_user/report_user + table user_blocks/user_reports,
 * RLS proprietaire uniquement). Aucune lecture cote client de qui a bloque
 * qui, ni des signalements des autres -- uniquement service_is_blocked_either_way
 * pour savoir si le contenu doit rester cache.
 */

export type ReportReason = 'spam' | 'harassment' | 'inappropriate_content' | 'impersonation' | 'other';

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'harassment', label: 'Harcèlement ou comportement abusif' },
  { value: 'inappropriate_content', label: 'Contenu inapproprié' },
  { value: 'impersonation', label: 'Usurpation d’identité' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Autre' },
];

export async function isBlockedEitherWay(otherUserId: string): Promise<boolean> {
  if (!supabase || !otherUserId) return false;
  const { data, error } = await supabase.rpc('service_is_blocked_either_way', { other_id: otherUserId });
  if (error) return false;
  return data === true;
}

export async function blockUser(targetId: string): Promise<void> {
  if (!supabase) throw new Error('Service indisponible.');
  const { error } = await supabase.rpc('block_user', { target_id: targetId });
  if (error) throw error;
}

export async function unblockUser(targetId: string): Promise<void> {
  if (!supabase) throw new Error('Service indisponible.');
  const { error } = await supabase.rpc('unblock_user', { target_id: targetId });
  if (error) throw error;
}

export async function reportUser(targetId: string, reason: ReportReason, details?: string, context: Record<string, unknown> = {}): Promise<void> {
  if (!supabase) throw new Error('Service indisponible.');
  const { error } = await supabase.rpc('report_user', {
    target_id: targetId,
    p_reason: reason,
    p_details: details ?? null,
    p_context: context,
  });
  if (error) throw error;
}

export type BlockedUserSummary = { id: string; username: string; displayName?: string | null; avatarUrl?: string | null; blockedAt: string };

export async function listBlockedUsers(): Promise<BlockedUserSummary[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('user_blocks')
    .select('blocked_id, created_at, blocked:profiles!user_blocks_blocked_id_fkey(id,username,display_name,avatar_url)')
    .order('created_at', { ascending: false });
  if (error || !Array.isArray(data)) return [];
  return data.flatMap((row: any) => {
    const p = Array.isArray(row.blocked) ? row.blocked[0] : row.blocked;
    if (!p?.id || !p?.username) return [];
    return [{ id: p.id, username: p.username, displayName: p.display_name, avatarUrl: p.avatar_url, blockedAt: row.created_at }];
  });
}
