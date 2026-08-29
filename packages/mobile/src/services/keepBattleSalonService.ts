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

export async function loadOpenBattleSalons(themeCode?: string | null): Promise<KeepBattleOpenSalon[]> {
  const { data, error } = await client().rpc('keep_battle_open_salons', { p_theme_code: themeCode || null });
  if (error) throw new Error(String(error.message || 'KEEP_BATTLE_SALONS_FAILED'));
  return Array.isArray(data) ? data as KeepBattleOpenSalon[] : [];
}

export async function loadBattleThemeLobby(): Promise<KeepBattleThemeLobby[]> {
  const { data, error } = await client().rpc('keep_battle_theme_lobby');
  if (error) throw new Error(String(error.message || 'KEEP_BATTLE_THEME_LOBBY_FAILED'));
  return Array.isArray(data) ? data as KeepBattleThemeLobby[] : [];
}
