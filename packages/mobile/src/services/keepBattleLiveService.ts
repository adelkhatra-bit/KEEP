import { supabase } from './supabaseClient';

export type KeepBattleLivePlayer = {
  profileId: string;
  username: string;
  avatarUrl?: string | null;
  themeCode: string;
  lastSeenAt: string;
};

export type KeepBattleIncomingChallenge = {
  id: string;
  challengerId: string;
  username: string;
  avatarUrl?: string | null;
  themeCode: string;
  createdAt: string;
  expiresAt: string;
};

export type KeepBattleOutgoingChallenge = {
  id: string;
  targetId: string;
  username: string;
  avatarUrl?: string | null;
  themeCode: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'CANCELLED';
  arenaId?: string | null;
  arenaCode?: string | null;
  expiresAt: string;
};

function client() {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  return supabase;
}

function str(row: any, camel: string, snake: string, fallback = '') {
  const value = row?.[camel] ?? row?.[snake] ?? fallback;
  return value == null ? fallback : String(value);
}

export async function heartbeatSoloBattle(themeCode: string): Promise<void> {
  const { error } = await client().rpc('keep_battle_solo_heartbeat', { p_theme_code: themeCode || 'MIX' });
  if (error) throw new Error(String(error.message || 'KEEP_BATTLE_HEARTBEAT_FAILED'));
}

export async function leaveSoloBattle(): Promise<void> {
  const { error } = await client().rpc('keep_battle_solo_leave');
  if (error) throw new Error(String(error.message || 'KEEP_BATTLE_LEAVE_FAILED'));
}

export async function loadLiveSoloPlayers(limit = 12): Promise<KeepBattleLivePlayer[]> {
  const { data, error } = await client().rpc('keep_battle_solo_available', { p_limit: limit });
  if (error) throw new Error(String(error.message || 'KEEP_BATTLE_LIVE_PLAYERS_FAILED'));
  return Array.isArray(data) ? data.map((row: any) => ({
    profileId: str(row, 'profileId', 'profile_id'),
    username: str(row, 'username', 'username', 'keep'),
    avatarUrl: row?.avatarUrl ?? row?.avatar_url ?? null,
    themeCode: str(row, 'themeCode', 'theme_code', 'MIX'),
    lastSeenAt: str(row, 'lastSeenAt', 'last_seen_at'),
  })).filter((row) => row.profileId) : [];
}

export async function sendBattleChallenge(targetId: string, themeCode: string): Promise<{ id: string; status: string; expiresAt?: string }> {
  const { data, error } = await client().rpc('keep_battle_challenge_send', { p_target_id: targetId, p_theme_code: themeCode || 'MIX' });
  if (error) throw new Error(String(error.message || 'KEEP_BATTLE_CHALLENGE_FAILED'));
  return {
    id: String((data as any)?.id || ''),
    status: String((data as any)?.status || 'PENDING'),
    expiresAt: (data as any)?.expiresAt ? String((data as any).expiresAt) : undefined,
  };
}

export async function loadIncomingBattleChallenges(): Promise<KeepBattleIncomingChallenge[]> {
  const { data, error } = await client().rpc('keep_battle_challenge_inbox');
  if (error) throw new Error(String(error.message || 'KEEP_BATTLE_CHALLENGE_INBOX_FAILED'));
  return Array.isArray(data) ? data.map((row: any) => ({
    id: str(row, 'id', 'id'),
    challengerId: str(row, 'challengerId', 'challenger_id'),
    username: str(row, 'username', 'username', 'keep'),
    avatarUrl: row?.avatarUrl ?? row?.avatar_url ?? null,
    themeCode: str(row, 'themeCode', 'theme_code', 'MIX'),
    createdAt: str(row, 'createdAt', 'created_at'),
    expiresAt: str(row, 'expiresAt', 'expires_at'),
  })).filter((row) => row.id) : [];
}

export async function loadOutgoingBattleChallenges(): Promise<KeepBattleOutgoingChallenge[]> {
  const { data, error } = await client().rpc('keep_battle_challenge_outgoing');
  if (error) throw new Error(String(error.message || 'KEEP_BATTLE_CHALLENGE_OUTBOX_FAILED'));
  return Array.isArray(data) ? data.map((row: any) => ({
    id: str(row, 'id', 'id'),
    targetId: str(row, 'targetId', 'target_id'),
    username: str(row, 'username', 'username', 'keep'),
    avatarUrl: row?.avatarUrl ?? row?.avatar_url ?? null,
    themeCode: str(row, 'themeCode', 'theme_code', 'MIX'),
    status: str(row, 'status', 'status', 'PENDING').toUpperCase() as KeepBattleOutgoingChallenge['status'],
    arenaId: row?.arenaId ?? row?.arena_id ?? null,
    arenaCode: row?.arenaCode ?? row?.arena_code ?? null,
    expiresAt: str(row, 'expiresAt', 'expires_at'),
  })).filter((row) => row.id) : [];
}

export async function respondBattleChallenge(challengeId: string, accept: boolean): Promise<{ status: string; arenaId?: string | null; arenaCode?: string | null }> {
  const { data, error } = await client().rpc('keep_battle_challenge_respond', { p_challenge_id: challengeId, p_accept: accept });
  if (error) throw new Error(String(error.message || 'KEEP_BATTLE_CHALLENGE_RESPONSE_FAILED'));
  return {
    status: String((data as any)?.status || ''),
    arenaId: (data as any)?.arenaId ? String((data as any).arenaId) : null,
    arenaCode: (data as any)?.arenaCode ? String((data as any).arenaCode) : null,
  };
}
