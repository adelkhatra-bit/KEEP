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
  perfectScoreBonusFree: number;
  /** @deprecated legacy alias kept for old clients */
  perfectDuelBonusFree: number;
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
  // Adel (12/09/2026) : "il est resté coincé sur Funk ... pourquoi il ne
  // change pas automatiquement" -- style réel du morceau tiré pour CETTE
  // manche parmi les styles sélectionnés, distinct du libellé global figé
  // (KeepBattleSoloPack.themeCode) qui ne peut représenter qu'un seul style
  // à la fois ('MIX' dès que 2+ styles sont cochés).
  themeCode?: string | null;
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
  perfectScoreBonusFree: 3,
  perfectDuelBonusFree: 3,
  ruleText: 'Bonnes réponses puis vitesse. Un seul bonus sans-faute : s’il y a plusieurs joueurs parfaits, le plus rapide reçoit un bonus Loki égal à la mise.',
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
      perfectScoreBonusFree: Number(raw.perfectScoreBonusFree ?? raw.perfectDuelBonusFree ?? stakeFree),
      perfectDuelBonusFree: Number(raw.perfectScoreBonusFree ?? raw.perfectDuelBonusFree ?? stakeFree),
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
export type KeepBattleSoloDailyStatus = { plan: string; used: number; limit: number | null; remaining: number | null; unlimited: boolean; resetsAt: string | null; dailyIncluded: number | null; purchasedRemaining: number | null };

function deviceTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'; }
  catch { return 'Europe/Paris'; }
}

export async function loadKeepBattleSoloDailyStatus(): Promise<KeepBattleSoloDailyStatus> {
  const { data, error } = await client().rpc('keep_battle_solo_daily_status', { p_timezone: deviceTimeZone() });
  if (error || !data || typeof data !== 'object') throw new Error(String(error?.message || 'BATTLE_SOLO_STATUS_UNAVAILABLE'));
  const raw = data as any;
  return {
    plan: String(raw.plan || 'FREE').toUpperCase(),
    used: Math.max(0, Number(raw.used || 0)),
    limit: raw.limit == null ? null : Math.max(0, Number(raw.limit)),
    remaining: raw.remaining == null ? null : Math.max(0, Number(raw.remaining)),
    unlimited: raw.unlimited === true,
    resetsAt: raw.resetsAt ? String(raw.resetsAt) : null,
    dailyIncluded: raw.dailyIncluded == null ? null : Math.max(0, Number(raw.dailyIncluded)),
    purchasedRemaining: raw.purchasedRemaining == null ? null : Math.max(0, Number(raw.purchasedRemaining)),
  };
}

// Adel (02/10/2026) : packs de Solos vendus par la plateforme contre des
// Free (réglables dans le Super Admin). Les Solos achetés s'ajoutent au jour
// et ne se perdent pas. `null` = fonction serveur pas encore déployée.
export type KeepBattleSoloPackOffer = { code: 'SMALL' | 'LARGE'; solos: number; free: number };
export type KeepBattleSoloPacks = { packs: KeepBattleSoloPackOffer[]; bonusRemaining: number; balance: number };
export async function loadKeepBattleSoloPacks(): Promise<KeepBattleSoloPacks | null> {
  const { data, error } = await client().rpc('keep_battle_solo_packs');
  if (error) {
    if (String((error as any).code) === 'PGRST202') return null;
    throw new Error(String(error.message || 'BATTLE_SOLO_PACKS_UNAVAILABLE'));
  }
  const raw = (data ?? {}) as any;
  return {
    packs: (Array.isArray(raw.packs) ? raw.packs : []).map((p: any) => ({
      code: String(p.code) === 'LARGE' ? 'LARGE' : 'SMALL',
      solos: Math.max(0, Number(p.solos || 0)),
      free: Math.max(0, Number(p.free || 0)),
    })),
    bonusRemaining: Math.max(0, Number(raw.bonusRemaining || 0)),
    balance: Math.max(0, Number(raw.balance || 0)),
  };
}
export async function buyKeepBattleSoloPack(code: 'SMALL' | 'LARGE'): Promise<{ solosAdded: number; freeSpent: number; balance: number }> {
  const { data, error } = await client().rpc('keep_battle_solo_buy_pack', { p_code: code });
  if (error) throw new Error(String(error.message || 'BATTLE_SOLO_PACK_FAILED'));
  const raw = (data ?? {}) as any;
  return { solosAdded: Number(raw.solosAdded || 0), freeSpent: Number(raw.freeSpent || 0), balance: Number(raw.balance || 0) };
}

// Adel (29/09/2026) : « pourquoi y'a pas la date de rechargement des Free ».
// Données brutes seulement (création du profil + bonus mensuel de la formule,
// même source plan_prices que planService) ; le calcul de date est fait par
// nextMonthlyFreeRecharge (battleHomeInfo), miroir du calcul serveur.
export async function loadMyFreeRechargeInfo(profileId: string, planCode: string): Promise<{ profileCreatedAt: string | null; monthlyBonus: number }> {
  const [{ data: profile }, { data: prices }] = await Promise.all([
    client().from('profiles').select('created_at').eq('id', profileId).maybeSingle(),
    client().from('plans').select('code,plan_prices!inner(period,is_active,effective_from,free_bonus_per_month)').eq('code', planCode.toUpperCase()).eq('plan_prices.is_active', true).eq('plan_prices.period', 'MONTHLY').maybeSingle(),
  ]);
  const rows = Array.isArray((prices as any)?.plan_prices) ? (prices as any).plan_prices : [];
  const latest = rows.slice().sort((a: any, b: any) => String(b.effective_from).localeCompare(String(a.effective_from)))[0];
  return { profileCreatedAt: (profile as any)?.created_at ? String((profile as any).created_at) : null, monthlyBonus: Math.max(0, Number(latest?.free_bonus_per_month || 0)) };
}

export async function consumeKeepBattleSoloDailyStart(sessionToken: string): Promise<KeepBattleSoloDailyStatus> {
  const token = String(sessionToken || '').trim();
  if (token.length < 8) throw new Error('BATTLE_SOLO_SESSION_TOKEN_INVALID');
  const { data, error } = await client().rpc('keep_battle_solo_consume_daily_start', { p_session_token: token, p_timezone: deviceTimeZone() });
  if (error) {
    const raw = [error.message, error.details, error.hint, error.code].filter(Boolean).join(' ');
    if (/BATTLE[_\s-]*SOLO[_\s-]*DAILY[_\s-]*LIMIT[_\s-]*REACHED/i.test(raw)) {
      throw new Error('BATTLE_SOLO_DAILY_LIMIT_REACHED');
    }
    throw new Error('BATTLE_SOLO_UNAVAILABLE');
  }
  const raw = (data && typeof data === 'object' ? data : {}) as any;
  return {
    plan: String(raw.plan || 'FREE').toUpperCase(),
    used: Math.max(0, Number(raw.used || 0)),
    limit: raw.limit == null ? null : Math.max(0, Number(raw.limit)),
    remaining: raw.remaining == null ? null : Math.max(0, Number(raw.remaining)),
    unlimited: raw.unlimited === true,
    resetsAt: raw.resetsAt ? String(raw.resetsAt) : null,
    dailyIncluded: raw.dailyIncluded == null ? null : Math.max(0, Number(raw.dailyIncluded)),
    purchasedRemaining: raw.purchasedRemaining == null ? null : Math.max(0, Number(raw.purchasedRemaining)),
  };
}

// Préparer un pack ne consomme plus un Solo. Le débit est déclenché par
// l'écran uniquement quand le premier extrait a réellement démarré.
export async function loadKeepBattleSoloPack(themeCode = 'MIX', roundCount = 8, themeCodes?: string[]): Promise<KeepBattleSoloPack> {
  // Build and validate the playable pack BEFORE consuming a daily start.
  // A catalogue/network failure must never burn one of the user's Solo slots.
  const selectedThemes = Array.from(new Set((themeCodes || [])
    .map((code) => code.trim().toUpperCase())
    .filter((code) => code && code !== 'MIX'))).slice(0, 3);
  const { data, error } = await client().rpc('keep_battle_solo_pack', {
    p_theme_code: selectedThemes[0] || themeCode.toUpperCase(),
    p_round_count: Math.max(5, Math.min(roundCount, 30)),
    p_theme_codes: selectedThemes.length ? selectedThemes : null,
  });
  if (error || !data || typeof data !== 'object') throw new Error(String(error?.message || 'BATTLE_SOLO_UNAVAILABLE'));
  const raw = data as any;
  // Adel (18/09/2026, audit) : simplifyArtistCredit retourne un format
  // différent de primaryArtistLabel (42 vs 28 char, règles de split différentes)
  // -- utilisé PARTOUT pour la déduplication, cela crée des doublons masqués.
  // Solution : utiliser primaryArtistLabel UNIQUEMENT, partout.
  const primaryArtistLabel = (full: string) => {
    const first = full.split(/\s*(?:,|&|\/|\+|\bfeat\.?\b|\bft\.?\b|\bx\b|\bet\b|\band\b|\bvs\.?\b)\s*/i)[0]?.trim() || full;
    return first.length > 28 ? `${first.slice(0, 26).trim()}…` : first;
  };
  const rounds = Array.isArray(raw.rounds) ? raw.rounds.map((round: any) => {
    const rawChoices: string[] = Array.isArray(round.choices) ? round.choices.map(String) : [];
    const cleanedChoices = rawChoices.map(primaryArtistLabel);
    const rawCorrect = String(round.correctAnswer || round.artist || '');
    const correctIndex = rawChoices.indexOf(rawCorrect);
    const correctAnswer = correctIndex >= 0 ? cleanedChoices[correctIndex] : primaryArtistLabel(rawCorrect);
    return {
      position: Number(round.position || 0),
      trackId: String(round.trackId || ''),
      title: String(round.title || ''),
      artist: primaryArtistLabel(String(round.artist || '')) || correctAnswer,
      artworkUrl: round.artworkUrl ? String(round.artworkUrl) : null,
      previewUrl: String(round.previewUrl || ''),
      themeCode: round.themeCode ? String(round.themeCode).toUpperCase() : null,
      choices: cleanedChoices,
      correctAnswer,
    };
  }).filter((round: KeepBattleSoloRound) => round.trackId && round.previewUrl && round.correctAnswer) : [];
  if (rounds.length < 5) throw new Error('BATTLE_CATALOG_TOO_SMALL');
  // Adel (18/09/2026) : "il faut au moins quatre réponses ... aucun doublon ...
  // une seule bonne réponse" -- le serveur historique renvoie 3 choix. Pour
  // conserver la même source musicale et garantir EXACTEMENT 4 réponses sans
  // doublons ni inventer d'artiste, on complète chaque manche avec un artiste
  // d'une autre manche du pack, déjà validé par le catalogue et distinct des
  // choix présents.
  rounds.forEach((round: KeepBattleSoloRound) => {
    const unique = Array.from(new Set(round.choices.filter(Boolean)));
    // Adel (18/09/2026, CRITICAL BUG) : les candidats étaient les BONNES
    // RÉPONSES d'autres manches, créant ainsi 2+ bonnes réponses par manche.
    // Solution: utiliser les CHOICES (mauvaises réponses) d'autres manches.
    // IMPORTANT: s'assurer que correctAnswer est TOUJOURS incluse dans les 4 réponses.
    // Adel (19/09/2026) : les choix incorrects doivent rester dans le même genre
    // musical (même themeCode) pour que le jeu soit cohérent et pas trop facile.
    // Priorité 1: même themeCode ; Priorité 2: autres themeCode si pas assez.
    const sameThemeCandidates = rounds
      .filter((item: KeepBattleSoloRound) => item.artist !== round.artist && item.themeCode === round.themeCode)
      .flatMap((item: KeepBattleSoloRound) => item.choices);
    const otherThemeCandidates = rounds
      .filter((item: KeepBattleSoloRound) => item.artist !== round.artist && item.themeCode !== round.themeCode)
      .flatMap((item: KeepBattleSoloRound) => item.choices);
    const allCandidates = [...sameThemeCandidates, ...otherThemeCandidates];
    for (const candidate of allCandidates) {
      if (unique.length >= 4) break;
      if (candidate && !unique.some((value) => value.toLocaleLowerCase() === candidate.toLocaleLowerCase())) unique.push(candidate);
    }
    // S'assurer que correctAnswer est dans unique (obligatoire pour le composant)
    if (!unique.some((value) => value.toLocaleLowerCase() === round.correctAnswer.toLocaleLowerCase())) {
      unique.unshift(round.correctAnswer);
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
