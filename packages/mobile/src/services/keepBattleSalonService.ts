import { supabase } from './supabaseClient';

export type KeepBattleOpenSalon = {
  id: string;
  arenaCode: string;
  themeCode: string;
  themeLabel: string;
  status: 'WAITING' | 'ACTIVE';
  players: number;
  maxPlayers: number;
  openSeats: number;
  queue: number;
  jackpotFree: number;
  hostUsername: string;
  hostAvatarUrl?: string | null;
  createdAt: string;
};

export type KeepBattleThemeLobby = {
  code: string;
  label: string;
  openSalons: number;
  players: number;
  queued: number;
};

function client() {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  return supabase;
}

function text(row: any, camel: string, snake: string, fallback = ''): string {
  const value = row?.[camel] ?? row?.[snake] ?? fallback;
  return value == null ? fallback : String(value);
}

function count(row: any, camel: string, snake: string, fallback = 0): number {
  const value = Number(row?.[camel] ?? row?.[snake] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function normalizeSalon(row: any): KeepBattleOpenSalon {
  const status = text(row, 'status', 'status', 'WAITING').toUpperCase() === 'ACTIVE' ? 'ACTIVE' : 'WAITING';
  const players = count(row, 'players', 'players');
  const maxPlayers = count(row, 'maxPlayers', 'max_players', 10);
  return {
    id: text(row, 'id', 'id'),
    arenaCode: text(row, 'arenaCode', 'arena_code'),
    themeCode: text(row, 'themeCode', 'theme_code', 'MIX'),
    themeLabel: text(row, 'themeLabel', 'theme_label', 'Mix surprise'),
    status,
    players,
    maxPlayers,
    openSeats: count(row, 'openSeats', 'open_seats', Math.max(0, maxPlayers - players)),
    queue: count(row, 'queue', 'queue'),
    jackpotFree: count(row, 'jackpotFree', 'jackpot_free', Math.max(0, players - 1) * 3),
    hostUsername: text(row, 'hostUsername', 'host_username', 'keep'),
    hostAvatarUrl: row?.hostAvatarUrl ?? row?.host_avatar_url ?? null,
    createdAt: text(row, 'createdAt', 'created_at', new Date(0).toISOString()),
  };
}

function normalizeTheme(row: any): KeepBattleThemeLobby {
  return {
    code: text(row, 'code', 'code', 'MIX'),
    label: text(row, 'label', 'label', 'Mix surprise'),
    openSalons: count(row, 'openSalons', 'open_salons'),
    players: count(row, 'players', 'players'),
    queued: count(row, 'queued', 'queued'),
  };
}

export async function loadOpenBattleSalons(themeCode?: string | null): Promise<KeepBattleOpenSalon[]> {
  const { data, error } = await client().rpc('keep_battle_open_salons', { p_theme_code: themeCode || null });
  if (error) throw new Error(String(error.message || 'KEEP_BATTLE_SALONS_FAILED'));
  return Array.isArray(data) ? data.map(normalizeSalon).filter((row) => row.id && row.arenaCode) : [];
}

export async function loadBattleThemeLobby(): Promise<KeepBattleThemeLobby[]> {
  const { data, error } = await client().rpc('keep_battle_theme_lobby');
  if (error) throw new Error(String(error.message || 'KEEP_BATTLE_THEME_LOBBY_FAILED'));
  return Array.isArray(data) ? data.map(normalizeTheme) : [];
}
