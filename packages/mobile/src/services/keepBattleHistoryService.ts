import { supabase } from './supabaseClient';

export interface KeepBattleSoloHistoryEntry {
  id: string;
  theme_code: string;
  round_count: number;
  correct_answers: number;
  free_before: number;
  free_earned: number;
  free_after: number;
  completed_at: string;
}

export async function loadKeepBattleSoloHistory(limit = 50): Promise<KeepBattleSoloHistoryEntry[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.rpc('keep_battle_solo_history_recent', { p_limit: limit });
    if (error || !Array.isArray(data)) return [];
    return data.map((item: any) => ({
      id: String(item.id || ''),
      theme_code: String(item.theme_code || 'MIX'),
      round_count: Number(item.round_count || 0),
      correct_answers: Number(item.correct_answers || 0),
      free_before: Number(item.free_before ?? 0),
      free_earned: Number(item.free_earned ?? 0),
      free_after: Number(item.free_after ?? 0),
      completed_at: String(item.completed_at || ''),
    }));
  } catch {
    return [];
  }
}
