import { supabase } from './supabaseClient';
import { isFeatureEnabled } from './featureFlagService';

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

// Adel (01/09/2026, capture d'écran à l'appui) : certains morceaux (BO de
// film, musique orchestrale) ont un champ "artist" rempli avec la liste
// complète des crédits ("Lisa Gerrard, Gavin Greenaway, The Lyndhurst
// Orchestra, ... & Hans Zimmer") au lieu du seul nom d'artiste -- illisible
// comme réponse de quiz et casse l'alignement des boutons ("les boutons
// doivent faire la même taille"). Un vrai duo/feat légitime ("Anuel AA &
// KAROL G") n'a jamais de virgule et reste inchangé ; une liste à rallonge
// (3+ noms séparés par des virgules) est réduite au premier nom, plus un
// éventuel "& Dernier Nom" final s'il ressemble à un second artiste crédité.
function simplifyArtistCredit(raw: string): string {
  const trimmed = raw.trim();
  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean);
  let simplified = trimmed;
  if (parts.length > 2) {
    const last = parts[parts.length - 1];
    const ampersandMatch = last.match(/&\s*(.+)$/);
    simplified = ampersandMatch ? `${parts[0]} & ${ampersandMatch[1].trim()}` : parts[0];
  }
  return simplified.length > 42 ? `${simplified.slice(0, 39).trimEnd()}…` : simplified;
}

// Adel (03/09/2026) : "si je coche plusieurs styles ... ca doit faire un mix
// de TOUS les styles que j'ai selectionnes" -- themeCode reste 'MIX' comme
// etiquette generique des qu'il y a 2+ styles coches (voir KeepBattleMobileGameV3),
// mais themeCodes porte la selection reelle pour que le serveur restreigne le
// tirage a l'UNION exacte de ces styles au lieu de tout le catalogue.
export async function loadKeepBattleSoloPack(themeCode = 'MIX', roundCount = 8, themeCodes?: string[]): Promise<KeepBattleSoloPack> {
  const { data, error } = await client().rpc('keep_battle_solo_pack', {
    p_theme_code: themeCode.toUpperCase(),
    p_round_count: Math.max(5, Math.min(roundCount, 30)),
    p_theme_codes: themeCodes && themeCodes.length ? themeCodes.map((c) => c.toUpperCase()) : null,
  });
  if (error || !data || typeof data !== 'object') throw new Error(String(error?.message || 'BATTLE_SOLO_UNAVAILABLE'));
  const raw = data as any;
  const rounds = Array.isArray(raw.rounds) ? raw.rounds.map((round: any) => {
    const rawChoices: string[] = Array.isArray(round.choices) ? round.choices.map(String) : [];
    const cleanedChoices = rawChoices.map(simplifyArtistCredit);
    const rawCorrect = String(round.correctAnswer || round.artist || '');
    const correctIndex = rawChoices.indexOf(rawCorrect);
    const correctAnswer = correctIndex >= 0 ? cleanedChoices[correctIndex] : simplifyArtistCredit(rawCorrect);
    return {
      position: Number(round.position || 0),
      trackId: String(round.trackId || ''),
      title: String(round.title || ''),
      artist: simplifyArtistCredit(String(round.artist || '')) || correctAnswer,
      artworkUrl: round.artworkUrl ? String(round.artworkUrl) : null,
      previewUrl: String(round.previewUrl || ''),
      choices: cleanedChoices,
      correctAnswer,
    };
  }).filter((round: KeepBattleSoloRound) => round.trackId && round.previewUrl && round.correctAnswer) : [];
  if (rounds.length < 5) throw new Error('BATTLE_CATALOG_TOO_SMALL');
  // Le serveur historique renvoie trois choix. Pour conserver la même source
  // musicale et garantir quatre réponses sans inventer d'artiste, on complète
  // chaque manche avec un artiste d'une autre manche du pack, déjà validé par
  // le catalogue et distinct des choix présents.
  rounds.forEach((round: KeepBattleSoloRound) => {
    const unique = Array.from(new Set(round.choices.filter(Boolean)));
    for (const candidate of rounds.map((item: KeepBattleSoloRound) => item.artist)) {
      if (unique.length >= 4) break;
      if (candidate && !unique.some((value) => value.toLocaleLowerCase() === candidate.toLocaleLowerCase())) unique.push(candidate);
    }
    round.choices = unique.slice(0, 4);
  });
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
  return isFeatureEnabled('keep_battle');
}

export { FALLBACK_RULES as DEFAULT_KEEP_BATTLE_RULES };
