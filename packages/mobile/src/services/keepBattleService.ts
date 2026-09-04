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
  // Adel (04/09/2026) : "on voit pas le troisieme joueur sur la jauge" --
  // BUG RÉEL : le match démarrait tout seul dès 2 joueurs présents, même
  // avec une 3e invite encore PENDING. Le serveur n'autorise plus le
  // démarrage tant que ce compte n'est pas à zéro.
  pendingInviteCount: number;
  roundCount: number;
  matchNo: number;
  currentRound: number;
  roundDurationMs: number;
  isHost: boolean;
  me?: { profileId: string; status: 'ACTIVE' | 'QUEUED' | 'ELIMINATED' | 'LEFT'; score: number; placement?: number | null; rematchReady?: boolean | null } | null;
  seats: KeepBattleArenaSeat[];
  leaderboard: Array<{ profileId: string; username: string; score: number; placement?: number | null; responseMs: number }>;
  round?: KeepBattleArenaRound | null;
  roundWinner?: { profileId: string; username: string; avatarUrl?: string | null; responseMs: number } | null;
  lastResult?: { matchNo: number; placement: number; score: number; correct: number; responseMs: number; creditDelta: number; won: boolean } | null;
  lastWinner?: { profileId: string; username: string; avatarUrl?: string | null; score: number; responseMs: number } | null;
  lastMatchResults?: Array<{ profileId: string; username: string; placement: number; score: number; correct: number; responseMs: number; won: boolean }>;
  rematchDeadline?: string | null;
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

export type KeepBattleGlobalLeaderboardEntry = {
  profileId: string;
  username: string;
  avatarUrl?: string | null;
  wins: number;
  matchesPlayed: number;
  totalScore: number;
  totalCorrect: number;
  avgResponseMs: number | null;
  // Adel (02/09/2026) : "mettre aussi le style qu'il écoute ... dans quelle
  // catégorie il est très fort" -- thème (genre) où ce joueur a le plus de
  // victoires d'arène, calculé côté serveur (keep_battle_global_leaderboard).
  topThemeCode: string | null;
  // Adel (03/09/2026) : "joue en solo mix confirmé ... il faut rajouter ce
  // système-là dans le classement global" -- même présence en direct et
  // même niveau que sur l'écran "Joueurs disponibles", ajoutés ici en plus
  // (aucun champ existant retiré).
  skillTier: string | null;
  isOnline: boolean;
  presenceThemeCode: string | null;
};

export async function loadKeepBattleGlobalLeaderboard(limit = 20): Promise<KeepBattleGlobalLeaderboardEntry[]> {
  const { data, error } = await client().rpc('keep_battle_global_leaderboard', { p_limit: Math.max(1, Math.min(Math.round(limit), 50)) });
  return (unwrap((data ?? []) as any[] | null, error)).map((row: any) => ({
    profileId: String(row.profile_id ?? row.profileId ?? ''),
    username: String(row.username ?? 'KEEP'),
    avatarUrl: row.avatar_url ?? row.avatarUrl ?? null,
    wins: Number(row.wins ?? 0),
    matchesPlayed: Number(row.matches_played ?? row.matchesPlayed ?? 0),
    totalScore: Number(row.total_score ?? row.totalScore ?? 0),
    totalCorrect: Number(row.total_correct ?? row.totalCorrect ?? 0),
    avgResponseMs: row.avg_response_ms ?? row.avgResponseMs ?? null,
    topThemeCode: row.top_theme_code ?? row.topThemeCode ?? null,
    skillTier: row.skill_tier ?? row.skillTier ?? null,
    isOnline: Boolean(row.is_online ?? row.isOnline ?? false),
    presenceThemeCode: row.presence_theme_code ?? row.presenceThemeCode ?? null,
  })).filter((row) => row.profileId);
}

// Adel (03/09/2026) : "quand j'appuie sur revanche, pareil, ça me met une
// invite fixe" -- pour un membre qui n'a pas l'arène ouverte (accueil
// Battle, classement...), seul moyen de savoir "ai-je une revanche en
// attente de ma réponse" où que je sois dans l'app.
export type KeepBattlePendingRematch = {
  arenaId: string;
  arenaCode: string;
  themeCode: string;
  rematchDeadline: string;
  participantUsernames: string[];
};

export async function loadPendingArenaRematches(): Promise<KeepBattlePendingRematch[]> {
  const { data, error } = await client().rpc('keep_battle_arena_pending_rematch_for_me');
  return (unwrap((data ?? []) as any[] | null, error)).map((row: any) => ({
    arenaId: String(row.arena_id ?? row.arenaId ?? ''),
    arenaCode: String(row.arena_code ?? row.arenaCode ?? ''),
    themeCode: String(row.theme_code ?? row.themeCode ?? 'MIX'),
    rematchDeadline: String(row.rematch_deadline ?? row.rematchDeadline ?? ''),
    participantUsernames: Array.isArray(row.participant_usernames ?? row.participantUsernames) ? (row.participant_usernames ?? row.participantUsernames) : [],
  })).filter((row) => row.arenaId);
}

// Adel (02/09/2026) : "un pop-up qui me permette de voir son style musical,
// quel style il est vraiment imbattable, toutes les statistiques" -- appelé
// à l'ouverture du pop-up d'un joueur (pas au chargement du classement
// entier) : un seul aller-retour indexé par profil, jamais N appels pour N
// lignes du classement.
export type KeepBattlePlayerThemeStat = { themeCode: string; wins: number; matches: number };
export type KeepBattlePlayerStats = {
  wins: number;
  matchesPlayed: number;
  totalScore: number;
  totalCorrect: number;
  avgResponseMs: number | null;
  topThemes: KeepBattlePlayerThemeStat[];
  // Adel (04/09/2026) : "il faut mettre le nombre d'utilisateur [abonnés], le
  // nombre de Free qu'il a et le nombre de Free qu'il a gagné" -- sur la
  // fiche stats d'un joueur, déjà publique côté Battle (victoires, matchs).
  followers: number;
  freeBalance: number;
  freeWon: number;
};

export async function loadKeepBattlePlayerStats(profileId: string): Promise<KeepBattlePlayerStats> {
  const { data, error } = await client().rpc('keep_battle_profile_battle_stats', { p_profile_id: profileId, p_theme_limit: 3 });
  const row = unwrap(data as any, error);
  return {
    wins: Number(row.wins ?? 0),
    matchesPlayed: Number(row.matchesPlayed ?? 0),
    totalScore: Number(row.totalScore ?? 0),
    totalCorrect: Number(row.totalCorrect ?? 0),
    avgResponseMs: row.avgResponseMs ?? null,
    topThemes: Array.isArray(row.topThemes) ? row.topThemes.map((t: any) => ({
      themeCode: String(t.themeCode ?? ''),
      wins: Number(t.wins ?? 0),
      matches: Number(t.matches ?? 0),
    })).filter((t: KeepBattlePlayerThemeStat) => t.themeCode) : [],
    followers: Number(row.followers ?? 0),
    freeBalance: Number(row.freeBalance ?? 0),
    freeWon: Number(row.freeWon ?? 0),
  };
}

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
 * complète uniquement les morceaux déjà connus de Loki avec des extraits
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

// Adel (04/09/2026) : "si j'ai sélectionné cinq [styles] ... il faut qu'il
// me mette un peu de tout, un mix de tout" -- themeCode reste l'étiquette
// d'affichage (premier style réel), mais themeCodes porte la sélection
// réelle pour que le serveur mixe l'UNION exacte de ces styles au lieu de
// n'utiliser que le premier, exactement comme loadKeepBattleSoloPack.
export async function createKeepBattleArena(themeCode = 'MIX', roundCount = 8, themeCodes?: string[]): Promise<KeepBattleArenaCreated> {
  const { data, error } = await client().rpc('keep_battle_arena_create', {
    p_theme_code: themeCode.toUpperCase(),
    p_round_count: Math.max(5, Math.min(roundCount, 12)),
    p_theme_codes: themeCodes && themeCodes.length ? themeCodes.map((c) => c.toUpperCase()) : null,
  });
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

// Adel (04/09/2026) : "lorsqu'un utilisateur sans faire exprès passe sur une
// autre page, il faut que lorsqu'il revienne automatiquement ... il revienne
// même s'il a loupé un ou deux morceaux" -- BUG RÉEL : quitter l'écran
// Battle (changement d'onglet) démonte KeepBattleArenaPanel et perd l'état
// local `arena`, sans aucun moyen de retrouver son siège actif au retour.
// Retourne l'état de l'arène où le joueur a encore un siège ACTIVE, ou null.
export async function loadMyActiveKeepBattleArena(): Promise<KeepBattleArenaState | null> {
  const { data, error } = await client().rpc('keep_battle_arena_my_active');
  if (error) return null;
  return (data as KeepBattleArenaState | null) ?? null;
}

// Adel (03/09/2026) : "un utilisateur pourra regarder le match en cours ...
// et pouvoir dire je veux participer sans envoyer d'invite, quand le match
// est terminé ça fera rentrer l'utilisateur" -- mode spectateur : un tiers
// (pas membre de l'arène) peut suivre un match EN COURS en lecture seule
// (scores, manche, révélation), sans jamais voir l'état de réponse propre à
// un joueur (myAnswer n'existe pas ici, contrairement a KeepBattleArenaState).
// joinKeepBattleArena (deja existante) fait le "+" : elle met en file
// d'attente (QUEUED) si un match tourne déjà, et fait automatiquement entrer
// au match suivant -- exactement le mécanisme déjà cablé côté serveur.
export type KeepBattleArenaSpectateSeat = { profileId: string; username: string; avatarUrl?: string | null; score: number; placement?: number | null };
export type KeepBattleArenaSpectate = {
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
  seats: KeepBattleArenaSpectateSeat[];
  round?: { position: number; artist?: string | null; artworkUrl?: string | null; startedAt?: string | null; closesAt?: string | null; revealUntil?: string | null; revealed?: boolean } | null;
};

export async function spectateKeepBattleArena(arenaCode: string): Promise<KeepBattleArenaSpectate> {
  const code = arenaCode.trim().toUpperCase();
  if (!code) throw new Error('BATTLE_ARENA_CODE_REQUIRED');
  const { data, error } = await client().rpc('keep_battle_arena_spectate', { p_arena_code: code });
  return unwrap(data as KeepBattleArenaSpectate | null, error);
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

export async function proposeKeepBattleArenaRematch(arenaId: string): Promise<KeepBattleArenaState> {
  const { data, error } = await client().rpc('keep_battle_arena_propose_rematch', { p_arena_id: arenaId });
  return unwrap(data as KeepBattleArenaState | null, error);
}

export async function respondKeepBattleArenaRematch(arenaId: string, ready: boolean): Promise<KeepBattleArenaState> {
  const { data, error } = await client().rpc('keep_battle_arena_rematch_respond', { p_arena_id: arenaId, p_ready: ready });
  return unwrap(data as KeepBattleArenaState | null, error);
}

export async function leaveKeepBattleArena(arenaId: string): Promise<void> {
  const { error } = await client().rpc('keep_battle_arena_leave', { p_arena_id: arenaId });
  if (error) throw error;
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
