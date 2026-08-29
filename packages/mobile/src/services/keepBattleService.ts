import { supabase } from './supabaseClient';

export type KeepBattleDecision = 'KEEP' | 'PASS';
export type KeepBattleStatus = 'WAITING' | 'ACTIVE' | 'COMPLETED' | 'EXPIRED';
export type KeepBattleRole = 'CHALLENGER' | 'OPPONENT';

export type KeepBattleMove = {
  actual: KeepBattleDecision;
  prediction: KeepBattleDecision;
  points: number;
};

export type KeepBattleRound = {
  position: number;
  track: {
    id?: string | null;
    title: string;
    artist: string;
    artworkUrl?: string | null;
    previewUrl?: string | null;
  };
  myMove?: KeepBattleMove | null;
  opponentMove?: KeepBattleMove | null;
  resolved: boolean;
};

export type KeepBattleState = {
  id: string;
  inviteCode: string;
  status: KeepBattleStatus;
  role: KeepBattleRole;
  roundCount: number;
  challengerScore: number;
  opponentScore: number;
  compatibilityScore?: number | null;
  expiresAt: string;
  rounds: KeepBattleRound[];
};

export type KeepBattleCreated = {
  id: string;
  inviteCode: string;
  status: KeepBattleStatus;
  roundCount: number;
  expiresAt: string;
};

export type KeepBattleStats = {
  battlesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  readsCorrect: number;
  readsTotal: number;
  readAccuracy: number;
  mutualKeeps: number;
  xp: number;
  currentWinStreak: number;
  bestWinStreak: number;
};

export type KeepBattleCreditStatus = {
  won: number;
  lost: number;
  net: number;
  remainingFree: number;
};

function client() {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  return supabase;
}

function unwrap<T>(data: T | null, error: any): T {
  if (error) throw new Error(String(error?.message || error?.code || 'KEEP_BATTLE_FAILED'));
  if (data == null) throw new Error('KEEP_BATTLE_EMPTY_RESPONSE');
  return data;
}

/**
 * KEEP BATTLE never writes to canonical keep_decisions. A duel is a separate
 * social-game signal; importing a duel KEEP into the user's real library must
 * always be an explicit later action.
 */
export async function createKeepBattle(args?: {
  roundCount?: number;
  opponentId?: string | null;
}): Promise<KeepBattleCreated> {
  const { data, error } = await client().rpc('keep_battle_create', {
    p_round_count: Math.max(5, Math.min(args?.roundCount ?? 8, 12)),
    p_opponent_id: args?.opponentId ?? null,
  });
  return unwrap(data as KeepBattleCreated | null, error);
}

export async function joinKeepBattle(inviteCode: string): Promise<{ id: string; status: KeepBattleStatus; role: KeepBattleRole }> {
  const code = inviteCode.trim().toUpperCase();
  if (!code) throw new Error('BATTLE_INVITE_REQUIRED');
  const { data, error } = await client().rpc('keep_battle_join', { p_invite_code: code });
  return unwrap(data as { id: string; status: KeepBattleStatus; role: KeepBattleRole } | null, error);
}

export async function loadKeepBattle(battleId: string): Promise<KeepBattleState> {
  const { data, error } = await client().rpc('keep_battle_state', { p_battle_id: battleId });
  return unwrap(data as KeepBattleState | null, error);
}

export async function submitKeepBattleMove(args: {
  battleId: string;
  position: number;
  actualDecision: KeepBattleDecision;
  predictedOtherDecision: KeepBattleDecision;
}): Promise<KeepBattleState> {
  const { data, error } = await client().rpc('keep_battle_submit_move', {
    p_battle_id: args.battleId,
    p_position: args.position,
    p_actual_decision: args.actualDecision,
    p_predicted_other_decision: args.predictedOtherDecision,
  });
  return unwrap(data as KeepBattleState | null, error);
}

export async function loadMyKeepBattleStats(): Promise<KeepBattleStats> {
  const { data, error } = await client().rpc('keep_battle_my_stats');
  return unwrap(data as KeepBattleStats | null, error);
}

export async function loadMyKeepBattleCreditStatus(): Promise<KeepBattleCreditStatus> {
  const { data, error } = await client().rpc('keep_battle_credit_status');
  return unwrap(data as KeepBattleCreditStatus | null, error);
}

export function buildKeepBattleInviteLink(inviteCode: string): string {
  const root = (process.env.EXPO_PUBLIC_WEB_URL || 'https://adelkhatra-bit.github.io/KEEP').replace(/\/$/, '');
  return `${root}/?battle=${encodeURIComponent(inviteCode.trim().toUpperCase())}`;
}
