import { supabase } from './supabaseClient';

export type KeepBattleLivePlayer = {
  profileId: string;
  username: string;
  avatarUrl?: string | null;
  themeCode: string;
  lastSeenAt: string;
  skillTier: 'DEBUTANT' | 'CONFIRME' | 'EXPERT';
  // Adel (03/09/2026) : "le style de match qu'il attend, le nombre de
  // morceaux ... ça reste enregistré, visible par les autres" -- préférence
  // durable (plusieurs styles possibles), séparée du thème de présence
  // ci-dessus (themeCode) qui ne reflète que l'écran où il se trouve là,
  // maintenant.
  preferredThemeCodes: string[];
  preferredRoundCount: number;
};

export type KeepBattleIncomingChallenge = {
  id: string;
  challengerId: string;
  username: string;
  avatarUrl?: string | null;
  themeCode: string;
  // Adel (03/09/2026) : "arrange-toi que les autres utilisateurs le voient"
  // -- nombre de morceaux choisi par celui qui défie, visible avant d'accepter.
  roundCount: number;
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function heartbeatSoloBattle(themeCode: string): Promise<void> {
  const { error } = await client().rpc('keep_battle_solo_heartbeat', { p_theme_code: themeCode || 'MIX' });
  if (error) throw new Error(String(error.message || 'KEEP_BATTLE_HEARTBEAT_FAILED'));
}

// Adel (02/09/2026) : "un utilisateur qui se connecte à la plateforme peut se
// rendre disponible même s'il est pas en train de faire des Battle" -- bascule
// manuelle indépendante du heartbeat de partie solo (voir
// keep_battle_set_manual_available). Utilisée globalement, pas seulement
// depuis l'écran Battle.
export async function setManualBattleAvailability(available: boolean, themeCode = 'MIX'): Promise<void> {
  const { error } = await client().rpc('keep_battle_set_manual_available', { p_available: available, p_theme_code: themeCode || 'MIX' });
  if (error) throw new Error(String(error.message || 'KEEP_BATTLE_AVAILABILITY_FAILED'));
}

export async function pingManualBattleAvailability(): Promise<void> {
  const { error } = await client().rpc('keep_battle_manual_availability_ping');
  if (error) throw new Error(String(error.message || 'KEEP_BATTLE_AVAILABILITY_PING_FAILED'));
}

export async function getManualBattleAvailability(): Promise<boolean> {
  const { data, error } = await client().rpc('keep_battle_get_manual_availability');
  if (error) throw new Error(String(error.message || 'KEEP_BATTLE_AVAILABILITY_READ_FAILED'));
  return Boolean(data);
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
    skillTier: str(row, 'skillTier', 'skill_tier', 'DEBUTANT') as KeepBattleLivePlayer['skillTier'],
    preferredThemeCodes: Array.isArray(row?.preferredThemeCodes ?? row?.preferred_theme_codes) ? (row.preferredThemeCodes ?? row.preferred_theme_codes) : ['MIX'],
    preferredRoundCount: Number(row?.preferredRoundCount ?? row?.preferred_round_count ?? 8) || 8,
  })).filter((row) => row.profileId) : [];
}

// Adel (03/09/2026) : "je puisse sélectionner plusieurs styles ... et que ça
// reste enregistré" -- préférence durable de match, séparée du thème choisi
// pour UN envoi d'invite précis (qui reste toujours un seul thème -- une
// arène n'a qu'une colonne theme_code).
export type KeepBattleMatchPreferences = { themeCodes: string[]; roundCount: number };

export async function loadMyMatchPreferences(): Promise<KeepBattleMatchPreferences> {
  const { data, error } = await client().rpc('keep_battle_load_match_preferences');
  if (error) throw new Error(String(error.message || 'KEEP_BATTLE_PREFS_LOAD_FAILED'));
  const raw = data as any;
  const themeCodes = Array.isArray(raw?.themeCodes) ? raw.themeCodes : ['MIX'];
  return { themeCodes: themeCodes.length ? themeCodes : ['MIX'], roundCount: Number(raw?.roundCount ?? 8) || 8 };
}

export async function saveMyMatchPreferences(themeCodes: string[], roundCount: number): Promise<KeepBattleMatchPreferences> {
  const { data, error } = await client().rpc('keep_battle_save_match_preferences', { p_theme_codes: themeCodes.length ? themeCodes : ['MIX'], p_round_count: Math.max(5, Math.min(Math.round(roundCount) || 8, 30)) });
  if (error) throw new Error(String(error.message || 'KEEP_BATTLE_PREFS_SAVE_FAILED'));
  const raw = data as any;
  const codes = Array.isArray(raw?.themeCodes) ? raw.themeCodes : ['MIX'];
  return { themeCodes: codes.length ? codes : ['MIX'], roundCount: Number(raw?.roundCount ?? 8) || 8 };
}

// Adel (02/09/2026) : "un petit joueur devra monter sa note en solo pour
// pouvoir participer" -- seul signal de niveau qui existe aujourd'hui (le
// solo est 100% local sinon) : appelé à la fin de chaque partie solo pour
// alimenter le palier serveur (keep_battle_skill_tier) utilisé pour bloquer
// un défi entre deux joueurs trop éloignés en niveau.
export async function reportSoloBattleResult(correct: number, total: number): Promise<void> {
  if (!(total > 0)) return;
  const { error } = await client().rpc('keep_battle_solo_report_result', { p_correct: correct, p_total: total });
  if (error) throw new Error(String(error.message || 'KEEP_BATTLE_SOLO_REPORT_FAILED'));
}

export async function sendBattleChallenge(targetId: string, themeCode: string, roundCount = 8): Promise<{ id: string; status: string; expiresAt?: string }> {
  const { data, error } = await client().rpc('keep_battle_challenge_send', { p_target_id: targetId, p_theme_code: themeCode || 'MIX', p_round_count: Math.max(5, Math.min(Math.round(roundCount) || 8, 30)) });
  if (error) throw new Error(String(error.message || 'KEEP_BATTLE_CHALLENGE_FAILED'));
  return {
    id: String((data as any)?.id || ''),
    status: String((data as any)?.status || 'PENDING'),
    expiresAt: (data as any)?.expiresAt ? String((data as any).expiresAt) : undefined,
  };
}

export async function sendBattleArenaChallenge(arenaId: string, targetId: string): Promise<{ id: string; status: string; arenaId?: string | null; arenaCode?: string | null; expiresAt?: string }> {
  const { data, error } = await client().rpc('keep_battle_arena_challenge_send', { p_arena_id: arenaId, p_target_id: targetId });
  if (error) throw new Error(String(error.message || 'KEEP_BATTLE_ARENA_CHALLENGE_FAILED'));
  return {
    id: String((data as any)?.id || ''),
    status: String((data as any)?.status || 'PENDING'),
    arenaId: (data as any)?.arenaId ? String((data as any).arenaId) : null,
    arenaCode: (data as any)?.arenaCode ? String((data as any).arenaCode) : null,
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
    roundCount: Number(row?.roundCount ?? row?.round_count ?? 8) || 8,
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

export async function respondBattleChallenge(challengeId: string, accept: boolean): Promise<{ status: string; arenaId?: string | null; arenaCode?: string | null; arenaState?: any | null }> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await client().rpc('keep_battle_challenge_respond', { p_challenge_id: challengeId, p_accept: accept });
    if (!error) {
      return {
        status: String((data as any)?.status || ''),
        arenaId: (data as any)?.arenaId ? String((data as any).arenaId) : null,
        arenaCode: (data as any)?.arenaCode ? String((data as any).arenaCode) : null,
        arenaState: (data as any)?.arenaState ?? null,
      };
    }
    lastError = error;
    const message = String(error.message || 'KEEP_BATTLE_CHALLENGE_RESPONSE_FAILED');
    const terminal = message.includes('FORBIDDEN') || message.includes('EXPIRED') || message.includes('NO_CREDIT') || message.includes('MINIMUM_THREE_FREE_REQUIRED');
    if (terminal || attempt === 2) throw new Error(message);
    await wait(180 + attempt * 220);
  }
  throw new Error(String((lastError as any)?.message || 'KEEP_BATTLE_CHALLENGE_RESPONSE_FAILED'));
}
