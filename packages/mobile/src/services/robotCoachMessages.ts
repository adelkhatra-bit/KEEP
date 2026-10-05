// Messages du robot (Adel, 05/10/2026) : courts, variés (jamais toujours la même phrase), sans prise de tête. Fonctions pures.
export type RobotCoachKind = 'SESSIONS' | 'NO_FREE' | 'NO_SOLO' | 'LOW_FREE' | 'GREETING';
/** Solde FREE à partir duquel le robot prévient (un GARDER coûte 3) : « il ne te reste que N FREE ». */
export const LOW_FREE_THRESHOLD = 3;

const OPENERS: Record<RobotCoachKind, string[]> = {
  SESSIONS: ['Hé !', 'Coucou,', 'Dis donc,', 'Petit coup de robot :', 'Bonne nouvelle :', 'Psst !', 'Salut,', 'Ding !'],
  NO_FREE: ['Petit rappel :', 'Dis donc,', 'Hé,', 'Info robot :', 'Coucou,', 'Juste pour te prévenir :'],
  NO_SOLO: ['Petit rappel :', 'Hé,', 'Info robot :', 'Coucou,', 'Oups :', 'Juste pour te prévenir :'],
  LOW_FREE: ['Attention,', 'Petit rappel :', 'Hé,', 'Info robot :', 'Psst,'],
  GREETING: ['Salut', 'Hello', 'Coucou', 'Yo', 'Hey'],
};
const CORES: Record<RobotCoachKind, string[]> = {
  SESSIONS: ['tu as des sessions en attente', 'une session t’attend', 'tes morceaux sont prêts à trier', 'des musiques attendent ton verdict'],
  NO_FREE: ['tu n’as plus de FREE', 'ton solde FREE est à zéro', 'plus de FREE pour garder des morceaux', 'tes FREE sont épuisés'],
  NO_SOLO: ['tes Solo du jour sont épuisés', 'plus de Solo pour aujourd’hui', 'tu as joué tous tes Solo du jour', 'la réserve de Solo est vide'],
  LOW_FREE: ['il ne te reste que {n} FREE', 'plus que {n} FREE dans ton solde', 'ton solde descend : {n} FREE restants', '{n} FREE restants, fais attention'],
  GREETING: ['t’es motivé ? Ajoute de la musique !', 'tu as raison, fais grandir ta communauté !', 'prêt à faire découvrir ton style ?', 'ta communauté t’attend !', 'une petite session aujourd’hui ?'],
};
const CLOSERS: Record<RobotCoachKind, string[]> = {
  SESSIONS: ['Touche pour les voir.', 'Viens les trier.', 'C’est par ici.', 'Un petit coup d’œil ?'],
  NO_FREE: ['On recharge ?', 'Touche pour recharger.', 'Gagne-en en Battle ou en parrainant un ami.', 'Les offres sont par ici.', 'Joue un Battle pour en regagner.'],
  NO_SOLO: ['Reviens demain ou recharge ici.', 'Touche pour voir les offres.', 'On en reprend ?', 'Recharge ici si tu veux continuer.'],
  LOW_FREE: ['Gagne-en en jouant un Battle.', 'Parraine un ami pour en gagner.', 'Un Battle gagné = des FREE en plus.', 'Partage ton lien : chaque inscrit t’en rapporte.'],
  GREETING: ['Invite tes amis ou tes collègues.', 'Va dire coucou dans le salon.', 'Parle à tes amis, ça fait grandir ta communauté.', 'Partage ton profil avec un pote.', 'Fais un tour dans le salon.'],
};

const hash = (text: string) => { let h = 2166136261; for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export function composeRobotLine(kind: RobotCoachKind, seed: string, count = 0, username = ''): string {
  const pick = (list: string[], salt: string) => list[hash(`${seed}:${salt}`) % list.length];
  let core = pick(CORES[kind], 'core');
  // Salut jeune et personnel (Adel 05/10/2026) : « Salut @pseudo 👋 t'es motivé ? … ».
  if (kind === 'GREETING') {
    const name = username.trim().replace(/^@+/, '');
    return `${pick(OPENERS.GREETING, 'open')}${name ? ` @${name}` : ''} 👋 ${core} ${pick(CLOSERS.GREETING, 'close')}`;
  }
  if (kind === 'LOW_FREE') {
    core = core.replace('{n}', String(Math.max(0, count)));
    if (count === 1) core = core.replace('1 FREE restants', '1 FREE restant').replace('plus que 1 FREE', 'plus qu’1 FREE');
  }
  if (kind === 'SESSIONS' && count > 0 && /tu as des sessions|une session/.test(core)) core = `tu as ${count} morceau${count > 1 ? 'x' : ''} en attente dans tes sessions`;
  return `${pick(OPENERS[kind], 'open')} ${core}. ${pick(CLOSERS[kind], 'close')}`;
}

export const robotCoachCombinationCount = (kind: RobotCoachKind): number => OPENERS[kind].length * CORES[kind].length * CLOSERS[kind].length;

export const ROBOT_ACTIONS: Record<RobotCoachKind, { route: string; params?: Record<string, unknown> }> = {
  SESSIONS: { route: 'SessionHistory' },
  NO_FREE: { route: 'Offers' },
  NO_SOLO: { route: 'Offers' },
  LOW_FREE: { route: 'Offers' },
  // Salut : un appui ouvre le salon (GlobalChatDock) ; repli = Découvertes.
  GREETING: { route: 'Main', params: { screen: 'Discover' } },
};

const RULES: Record<RobotCoachKind, { minGapMs: number; maxPerDay: number }> = {
  SESSIONS: { minGapMs: 60 * 1000, maxPerDay: 40 },
  NO_FREE: { minGapMs: 6 * 3600 * 1000, maxPerDay: 2 },
  NO_SOLO: { minGapMs: 6 * 3600 * 1000, maxPerDay: 2 },
  LOW_FREE: { minGapMs: 12 * 3600 * 1000, maxPerDay: 1 },
  GREETING: { minGapMs: 6 * 3600 * 1000, maxPerDay: 2 },
};
export type Memory = Record<string, { lastAt: number; day: string; count: number }>;

export function canRobotSpeak(memory: Memory, kind: RobotCoachKind, now: number): boolean {
  const rule = RULES[kind];
  const entry = memory[kind];
  if (!entry) return true;
  if (now - entry.lastAt < rule.minGapMs) return false;
  const today = new Date(now).toISOString().slice(0, 10);
  return !(entry.day === today && entry.count >= rule.maxPerDay);
}

