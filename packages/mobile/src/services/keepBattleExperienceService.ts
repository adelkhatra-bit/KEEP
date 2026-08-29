import { supabase } from './supabaseClient';

export type KeepBattleArenaRules = {
  stakeFree: number;
  minimumFreeRequired: number;
  maxPlayers: number;
  singleWinner: boolean;
  answerLockedOnTap: boolean;
  ranking: string;
  fullArenaNetPrize: number;
  ruleText?: string;
};

export type KeepBattleSoloRound = {
  position: number;
  trackId: string;
  title: string;
  artist: string;
  artworkUrl?: string | null;
  previewUrl: string;
  choices: string[];
  correctAnswer: string;
};

export type KeepBattleSoloPack = {
  mode: 'SOLO_TRAINING';
  themeCode: string;
  roundCount: number;
  stakeFree: 0;
  rewardFree: 0;
  rounds: KeepBattleSoloRound[];
};

const FALLBACK_RULES: KeepBattleArenaRules = {
  stakeFree: 3,
  minimumFreeRequired: 3,
  maxPlayers: 10,
  singleWinner: true,
  answerLockedOnTap: true,
  ranking: 'CORRECT_ANSWERS_THEN_SPEED',
  fullArenaNetPrize: 27,
  ruleText: 'Bonnes réponses puis vitesse. Un seul gagnant.',
};

function client() {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  return supabase;
}

export async function loadKeepBattleArenaRules(): Promise<KeepBattleArenaRules> {
  if (!supabase) return FALLBACK_RULES;
  try {
    const { data, error } = await client().rpc('keep_battle_arena_rules');
    if (error || !data || typeof data !== 'object') return FALLBACK_RULES;
    const raw = data as any;
    const maxPlayers = Number(raw.maxPlayers ?? FALLBACK_RULES.maxPlayers);
    const stakeFree = Number(raw.stakeFree ?? FALLBACK_RULES.stakeFree);
    return {
      stakeFree,
      minimumFreeRequired: Number(raw.minimumFreeRequired ?? stakeFree),
      maxPlayers,
      singleWinner: raw.singleWinner !== false,
      answerLockedOnTap: raw.answerLockedOnTap !== false,
      ranking: String(raw.ranking || FALLBACK_RULES.ranking),
      fullArenaNetPrize: Number(raw.fullArenaNetPrize ?? Math.max(0, maxPlayers - 1) * stakeFree),
      ruleText: raw.ruleText ? String(raw.ruleText) : FALLBACK_RULES.ruleText,
    };
  } catch {
    return FALLBACK_RULES;
  }
}

export async function loadKeepBattleSoloPack(themeCode = 'MIX', roundCount = 8): Promise<KeepBattleSoloPack> {
  const { data, error } = await client().rpc('keep_battle_solo_pack', {
    p_theme_code: themeCode.toUpperCase(),
    p_round_count: Math.max(5, Math.min(roundCount, 12)),
  });
  if (error || !data || typeof data !== 'object') throw new Error(String(error?.message || 'BATTLE_SOLO_UNAVAILABLE'));
  const raw = data as any;
  const rounds = Array.isArray(raw.rounds) ? raw.rounds.map((round: any) => ({
    position: Number(round.position || 0),
    trackId: String(round.trackId || ''),
    title: String(round.title || ''),
    artist: String(round.artist || ''),
    artworkUrl: round.artworkUrl ? String(round.artworkUrl) : null,
    previewUrl: String(round.previewUrl || ''),
    choices: Array.isArray(round.choices) ? round.choices.map(String) : [],
    correctAnswer: String(round.correctAnswer || round.artist || ''),
  })).filter((round: KeepBattleSoloRound) => round.trackId && round.previewUrl && round.correctAnswer) : [];
  if (rounds.length < 5) throw new Error('BATTLE_CATALOG_TOO_SMALL');
  return {
    mode: 'SOLO_TRAINING',
    themeCode: String(raw.themeCode || themeCode).toUpperCase(),
    roundCount: rounds.length,
    stakeFree: 0,
    rewardFree: 0,
    rounds,
  };
}

export async function isKeepBattleEnabled(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data, error } = await client()
      .from('feature_flags')
      .select('is_enabled_globally,rollout_percent')
      .eq('key', 'keep_battle')
      .maybeSingle();
    if (error || !data) return false;
    return Boolean((data as any).is_enabled_globally) && Number((data as any).rollout_percent ?? 100) > 0;
  } catch {
    return false;
  }
}

export { FALLBACK_RULES as DEFAULT_KEEP_BATTLE_RULES };
