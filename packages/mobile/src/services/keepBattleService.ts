import { supabase } from './supabaseClient';

export type KeepBattleDecision = 'KEEP' | 'PASS';
export type KeepBattleStatus = 'WAITING' | 'ACTIVE' | 'COMPLETED' | 'EXPIRED';
export type KeepBattleRole = 'CHALLENGER' | 'OPPONENT';

export type KeepBattleMove = {
  actual: KeepBattleDecision;
  prediction: KeepBattleDecision;
  points: number;
  responseMs?: number | null;
  submittedAt?: string | null;
  predictionCorrect?: boolean | null;
};

export type KeepBattleRound = {
  position: number;
  track: {
    id?: string | null;
    title?: string | null;
    artist?: string | null;
    artworkUrl?: string | null;
    previewUrl?: string | null;
  };
  myMove?: KeepBattleMove | null;
  opponentMove?: KeepBattleMove | null;
  resolved: boolean;
  revealed?: boolean;
};

export type KeepBattleState = {
  id: string;
  inviteCode: string;
  status: KeepBattleStatus;
  role: KeepBattleRole;
  themeCode?: string;
  roundCount: number;
  challengerScore: number;
  opponentScore: number;
  compatibilityScore?: number | null;
  expiresAt: string;
  rounds: KeepBattleRound[];
  matchmaking?: 'WAITING' | 'MATCHED';
  remainingFree?: number;
};

export type KeepBattleCreated = {
  id: string;
  inviteCode: string;
  status: KeepBattleStatus;
  themeCode?: string;
  roundCount: number;
  expiresAt: string;
  matchmaking?: 'WAITING' | 'MATCHED';
  remainingFree?: number;
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

export type KeepBattleTheme = { code: string; label: string; sortOrder?: number };
export type KeepBattleLobby = { waiting: number; active: number; completedToday: number };

export type KeepBattleArenaSeat = {
  profileId: string;
  username: string;
  avatarUrl?: string | null;
  followers: number;
  favoriteGenres: string[];
  favoriteArtists: string[];
  score: number;
  placement?: number | null;
  isHost?: boolean;
};

export type KeepBattleArenaRound = {
  position: number;
  title?: string | null;
  artist?: string | null;
  artworkUrl?: string | null;
  previewUrl?: string | null;
  choices?: string[];
  startedAt?: string | null;
  closesAt?: string | null;
  revealUntil?: string | null;
  revealed?: boolean;
  answered?: boolean;
  myAnswer?: {
    selectedAnswer: string;
    responseMs: number;
    points: number;
    correct?: boolean | null;
  } | null;
};

export type KeepBattleArenaState = {
  id: string;
  arenaCode: string;
  themeCode: string;
  status: 'WAITING' | 'ACTIVE' | 'CLOSED' | 'EXPIRED';
  maxPlayers: number;
  openSeats: number;
  queue: number;
  roundCount: number;
  matchNo: number;
  currentRound: number;
  roundDurationMs: number;
  isHost: boolean;
  me?: { profileId: string; status: 'ACTIVE' | 'QUEUED' | 'ELIMINATED' | 'LEFT'; score: number; placement?: number | null } | null;
  seats: KeepBattleArenaSeat[];
  leaderboard: Array<{ profileId: string; username: string; score: number; placement?: number | null; responseMs: number }>;
  round?: KeepBattleArenaRound | null;
  roundWinner?: { profileId: string; username: string; avatarUrl?: string | null; responseMs: number } | null;
  lastResult?: { matchNo: number; placement: number; score: number; correct: number; responseMs: number; creditDelta: number; won: boolean } | null;
  lastWinner?: { profileId: string; username: string; avatarUrl?: string | null; score: number; responseMs: number } | null;
};

export type KeepBattleArenaWinner = {
  matchNo: number;
  profileId: string;
  username: string;
  avatarUrl?: string | null;
  score: number;
  responseMs: number;
  createdAt?: string | null;
};

export type KeepBattleArenaCreated = {
  id: string;
  arenaCode: string;
  themeCode: string;
  status: 'WAITING' | 'ACTIVE';
  players: number;
  maxPlayers: number;
  queue: number;
  matchNo: number;
};

export type KeepBattleArenaLobby = {
  waitingArenas: number;
  activeArenas: number;
  activePlayers: number;
  queuedPlayers: number;
  maxVisiblePerArena: number;
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

export type KeepBattleCatalogRefresh = {
  ok: boolean;
  secretRequired: boolean;
  provider?: string;
  scanned?: number;
  enriched?: number;
  themeLinksAdded?: number;
  playableBefore?: number;
  playableAfter?: number;
  skipped?: boolean;
};

/**
 * Enrichit la réserve centrale Battle sans utiliser la bibliothèque personnelle
 * du joueur. La fonction serveur ne nécessite aucune clé musicale privée : elle
 * complète uniquement les morceaux déjà connus de KEEP avec des extraits
 * promotionnels publics disponibles.
 */
export async function refreshKeepBattleCatalog(limit = 24): Promise<KeepBattleCatalogRefresh | null> {
  try {
    const { data, error } = await client().functions.invoke('keep-battle-catalog-refresh', {
      body: { limit: Math.max(5, Math.min(Math.floor(limit), 36)) },
    });
    if (error || !data) return null;
    return data as KeepBattleCatalogRefresh;
  } catch {
    return null;
  }
}

/** KEEP BATTLE is separate from canonical keep_decisions. */
export async function createKeepBattle(args?: { roundCount?: number; opponentId?: string | null; themeCode?: string }): Promise<KeepBattleCreated> {
  const { data, error } = await client().rpc('keep_battle_create_themed', {
    p_round_count: Math.max(5, Math.min(args?.roundCount ?? 8, 12)),
    p_opponent_id: args?.opponentId ?? null,
    p_theme_code: (args?.themeCode || 'MIX').toUpperCase(),
  });
  return unwrap(data as KeepBattleCreated | null, error);
}

export async function matchmakeKeepBattle(themeCode = 'MIX', roundCount = 8): Promise<KeepBattleState | KeepBattleCreated> {
  const { data, error } = await client().rpc('keep_battle_matchmake_v2', {
    p_round_count: Math.max(5, Math.min(roundCount, 12)),
    p_theme_code: themeCode.toUpperCase(),
  });
  return unwrap(data as KeepBattleState | KeepBattleCreated | null, error);
}

export async function joinKeepBattle(inviteCode: string): Promise<{ id: string; status: KeepBattleStatus; role: KeepBattleRole }> {
  const code = inviteCode.trim().toUpperCase();
  if (!code) throw new Error('BATTLE_INVITE_REQUIRED');
  const { data, error } = await client().rpc('keep_battle_join', { p_invite_code: code });
  return unwrap(data as { id: string; status: KeepBattleStatus; role: KeepBattleRole } | null, error);
}

export async function loadCurrentKeepBattle(): Promise<KeepBattleState | null> {
  const { data, error } = await client().rpc('keep_battle_current');
  if (error) throw new Error(String(error?.message || error?.code || 'KEEP_BATTLE_FAILED'));
  return (data ?? null) as KeepBattleState | null;
}

export async function loadKeepBattle(battleId: string): Promise<KeepBattleState> {
  const { data, error } = await client().rpc('keep_battle_state', { p_battle_id: battleId });
  return unwrap(data as KeepBattleState | null, error);
}

export async function submitKeepBattleMove(args: { battleId: string; position: number; actualDecision: KeepBattleDecision; predictedOtherDecision: KeepBattleDecision; responseMs?: number }): Promise<KeepBattleState> {
  const { data, error } = await client().rpc('keep_battle_submit_move_v2', {
    p_battle_id: args.battleId,
    p_position: args.position,
    p_actual_decision: args.actualDecision,
    p_predicted_other_decision: args.predictedOtherDecision,
    p_response_ms: Math.max(0, Math.round(args.responseMs ?? 0)),
  });
  return unwrap(data as KeepBattleState | null, error);
}

export async function cancelWaitingKeepBattle(battleId: string): Promise<boolean> {
  const { data, error } = await client().rpc('keep_battle_cancel_waiting', { p_battle_id: battleId });
  return unwrap(data as boolean | null, error);
}

export async function loadMyKeepBattleStats(): Promise<KeepBattleStats> {
  const { data, error } = await client().rpc('keep_battle_my_stats');
  return unwrap(data as KeepBattleStats | null, error);
}

export async function loadMyKeepBattleCreditStatus(): Promise<KeepBattleCreditStatus> {
  const { data, error } = await client().rpc('keep_battle_credit_status');
  return unwrap(data as KeepBattleCreditStatus | null, error);
}

export async function loadKeepBattleThemes(): Promise<KeepBattleTheme[]> {
  const { data, error } = await client().from('keep_battle_themes').select('code,label,sort_order').eq('enabled', true).order('sort_order', { ascending: true });
  if (error) throw new Error(String(error.message || 'KEEP_BATTLE_THEME_FAILED'));
  return (data ?? []).map((row: any) => ({ code: String(row.code), label: String(row.label), sortOrder: Number(row.sort_order ?? 100) }));
}

export async function loadKeepBattleLobby(themeCode?: string | null): Promise<KeepBattleLobby> {
  const { data, error } = await client().rpc('keep_battle_lobby_status', { p_theme_code: themeCode || null });
  return unwrap(data as KeepBattleLobby | null, error);
}

export function subscribeKeepBattle(battleId: string, onChange: () => void) {
  const c = supabase;
  if (!c) return () => {};
  const channel = c.channel(`battle:${battleId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'keep_battles', filter: `id=eq.${battleId}` }, onChange)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'keep_battle_moves', filter: `battle_id=eq.${battleId}` }, onChange)
    .subscribe();
  return () => { void c.removeChannel(channel); };
}

export async function createKeepBattleArena(themeCode = 'MIX', roundCount = 8): Promise<KeepBattleArenaCreated> {
  const { data, error } = await client().rpc('keep_battle_arena_create', { p_theme_code: themeCode.toUpperCase(), p_round_count: Math.max(5, Math.min(roundCount, 12)) });
  return unwrap(data as KeepBattleArenaCreated | null, error);
}

export async function joinKeepBattleArena(arenaCode: string): Promise<KeepBattleArenaCreated & { myStatus?: string }> {
  const code = arenaCode.trim().toUpperCase();
  if (!code) throw new Error('BATTLE_ARENA_CODE_REQUIRED');
  const { data, error } = await client().rpc('keep_battle_arena_join', { p_arena_code: code });
  return unwrap(data as (KeepBattleArenaCreated & { myStatus?: string }) | null, error);
}

export async function loadKeepBattleArena(arenaId: string): Promise<KeepBattleArenaState> {
  const { data, error } = await client().rpc('keep_battle_arena_state', { p_arena_id: arenaId });
  return unwrap(data as KeepBattleArenaState | null, error);
}

export async function loadKeepBattleArenaWinnerHistory(arenaId: string, limit = 10): Promise<KeepBattleArenaWinner[]> {
  const { data, error } = await client().rpc('keep_battle_arena_winner_history', {
    p_arena_id: arenaId,
    p_limit: Math.max(1, Math.min(Math.round(limit), 20)),
  });
  return unwrap((data ?? []) as KeepBattleArenaWinner[] | null, error);
}

export async function startKeepBattleArena(arenaId: string): Promise<KeepBattleArenaState> {
  const { data, error } = await client().rpc('keep_battle_arena_start', { p_arena_id: arenaId });
  return unwrap(data as KeepBattleArenaState | null, error);
}

export async function submitKeepBattleArenaQuizAnswer(arenaId: string, selectedAnswer: string): Promise<KeepBattleArenaState> {
  const { data, error } = await client().rpc('keep_battle_arena_submit_quiz', { p_arena_id: arenaId, p_selected_answer: selectedAnswer.trim() });
  return unwrap(data as KeepBattleArenaState | null, error);
}

export async function loadKeepBattleArenaLobby(): Promise<KeepBattleArenaLobby> {
  const { data, error } = await client().rpc('keep_battle_arena_lobby');
  return unwrap(data as KeepBattleArenaLobby | null, error);
}

export function subscribeKeepBattleArena(arenaId: string, onChange: () => void) {
  const c = supabase;
  if (!c) return () => {};
  const channel = c.channel(`battle-arena:${arenaId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'keep_battle_arenas', filter: `id=eq.${arenaId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'keep_battle_arena_members', filter: `arena_id=eq.${arenaId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'keep_battle_arena_rounds', filter: `arena_id=eq.${arenaId}` }, onChange)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'keep_battle_arena_answers', filter: `arena_id=eq.${arenaId}` }, onChange)
    .subscribe();
  return () => { void c.removeChannel(channel); };
}

export function buildKeepBattleInviteLink(inviteCode: string): string {
  const root = (process.env.EXPO_PUBLIC_WEB_URL || 'https://adelkhatra-bit.github.io/KEEP').replace(/\/$/, '');
  return `${root}/?battle=${encodeURIComponent(inviteCode.trim().toUpperCase())}`;
}

export function buildKeepBattleArenaInviteLink(arenaCode: string): string {
  const root = (process.env.EXPO_PUBLIC_WEB_URL || 'https://adelkhatra-bit.github.io/KEEP').replace(/\/$/, '');
  return `${root}/?arena=${encodeURIComponent(arenaCode.trim().toUpperCase())}`;
}
