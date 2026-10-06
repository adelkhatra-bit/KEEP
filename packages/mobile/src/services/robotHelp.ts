// Robot d'accueil et d'aide (Adel, 06/10/2026, IDEA-154) : salut avec le pseudo SANS « @ » seulement quand l'utilisateur revient après une absence,
// trois propositions cliquables (Solo / Loki Pulse / communauté), explication une fois sur place, et appel du robot par 5 touchers rapprochés. Module PUR.
export type HelpActionKey = 'SOLO' | 'PULSE' | 'COMMUNITY' | 'PLAYLISTS' | 'SEARCH' | 'STORY' | 'REPORT';
export type RobotAction = { key: HelpActionKey; label: string; route: string; params?: Record<string, unknown> };

export const HELP_ACTIONS: RobotAction[] = [
  { key: 'SOLO', label: '🎮 Faire un Solo', route: 'Main', params: { screen: 'Parties', params: { openBattle: true, source: 'ROBOT' } } },
  { key: 'PULSE', label: '🎧 Loki Pulse', route: 'Main', params: { screen: 'Listen' } },
  { key: 'COMMUNITY', label: '🤝 Ma communauté', route: 'Main', params: { screen: 'Profile' } },
];

/**
 * Menu de la secousse (Adel, 06/10/2026) : « quand il secoue, le robot met plusieurs propositions, il clique dessus, ça le dirige
 * directement, et il lui explique comment faire ». Libellés courts (2 mots). REPORT ouvre le signalement (pas d'écran).
 */
export const SHAKE_ACTIONS: RobotAction[] = [
  { key: 'PULSE', label: '🎧 Loki Pulse', route: 'Main', params: { screen: 'Listen' } },
  { key: 'COMMUNITY', label: '👥 Communauté', route: 'Main', params: { screen: 'Profile' } },
  { key: 'PLAYLISTS', label: '📀 Playlists', route: 'Main', params: { screen: 'MyMusic' } },
  { key: 'SEARCH', label: '🔎 Chercher', route: 'Main', params: { screen: 'Discover' } },
  { key: 'STORY', label: '⭕ Ma story', route: 'Main', params: { screen: 'Profile' } },
  { key: 'SOLO', label: '🎮 Solo', route: 'Main', params: { screen: 'Parties', params: { openBattle: true, source: 'ROBOT' } } },
  { key: 'REPORT', label: '🐞 Un souci', route: '' },
];

/** Petit mot d'explication du robot une fois arrivé : il montre quoi toucher (sans nom, sans « bonjour »). */
export const HELP_TIPS: Record<HelpActionKey, string[]> = {
  SOLO: ['Touche « Solo », réponds aux extraits : chaque bonne réponse te fait gagner des FREE. Tu peux t’arrêter quand tu veux.', 'Ici, un Solo : écoute, devine, gagne des FREE. Appuie sur le bouton Solo pour commencer.'],
  PULSE: ['Touche une bulle du Loki Pulse pour écouter et découvrir. Ou appuie sur le grand bouton rond pour identifier un son.', 'Loki Pulse, ce sont les sons qui te ressemblent : touche une bulle, écoute, et garde ceux que tu aimes.'],
  COMMUNITY: ['Ta communauté se construit ici : partage ton profil, ajoute des musiques en story, et suis des amis qui ont ton style.', 'Voici ton profil : garde de la musique, mets-la en story et partage ton lien pour inviter tes amis.'],
  PLAYLISTS: ['Tes playlists : touche une playlist pour l’écouter, ou ＋ pour en créer une.', 'Ici tes playlists. Touche ＋ pour en créer une.'],
  SEARCH: ['Touche 🔎 en haut pour chercher un ami ou un style.', 'Cherche un pseudo avec 🔎, puis abonne-toi.'],
  STORY: ['Touche ta photo en haut : ＋ pour ajouter une musique à ta story.', 'Ta story : touche ta photo, puis ＋.'],
  REPORT: ['Dis-moi ce qui ne va pas.', 'Explique le souci en quelques mots.'],
};

const hash = (text: string) => { let h = 2166136261; for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return h >>> 0; };
const cleanName = (username?: string | null) => String(username ?? '').trim().replace(/^@+/, '');

const HELLO = ['Salut', 'Hello', 'Coucou', 'Hey', 'Yo', 'Ça fait plaisir de te revoir'];
const ASK = ['une petite envie de Solo ?', 'on se fait un Solo ?', 'prêt pour un Solo ?', 'un Solo pour t’échauffer ?', 'ça te dit un Solo ?'];
const PULSE = ['Ou va sur Loki Pulse prendre de la musique et créer ta communauté !', 'Sinon, file sur Loki Pulse choisir des sons et construire ta communauté !', 'Ou passe par Loki Pulse : prends de la musique et fais grandir ta communauté !', 'Autre idée : Loki Pulse, pour piocher de la musique et créer ta communauté !'];
const EMOJI = ['👋', '🎧', '✨', '🔥', '🎶'];

/** Message de retour après une absence : « Salut Adel 👋 une petite envie de Solo ? Ou va sur Loki Pulse… » (jamais « @ », formulation qui change). */
export function composeWelcomeBack(username: string, seed = 0): string {
  const n = cleanName(username);
  const h = hash(`${n}:${seed}`);
  return `${HELLO[h % HELLO.length]}${n ? ` ${n}` : ''} ${EMOJI[(h >>> 3) % EMOJI.length]} ${ASK[(h >>> 6) % ASK.length].replace(/^./, (c) => c)} ${PULSE[(h >>> 9) % PULSE.length]}`;
}
/** Version parlée (sans emoji ni ponctuation étrange). */
export function spokenWelcome(username: string, seed = 0): string {
  return composeWelcomeBack(username, seed).replace(/[\p{Extended_Pictographic}]/gu, '').replace(/\s+/g, ' ').trim();
}

const CALL = ['Qu’est-ce que je peux faire pour toi', 'Je t’écoute', 'Besoin d’un coup de main', 'Tu m’as appelé', 'Alors, que puis-je faire pour toi'];
export function composeCall(username: string, seed = 0): string {
  const n = cleanName(username);
  const h = hash(`call:${n}:${seed}`);
  const base = CALL[h % CALL.length];
  return `${base}${n ? `, ${n}` : ''} ? Choisis ce qui te tente :`;
}

export function pickTip(key: HelpActionKey, seed = 0): string {
  const list = HELP_TIPS[key];
  return list[hash(`${key}:${seed}`) % list.length];
}

/** Retour après une absence (4 h) : pas de salut à chaque ouverture. */
export const WELCOME_BACK_AFTER_MS = 4 * 3600 * 1000;
export function shouldWelcomeBack(lastActiveAt: number | null | undefined, now: number): boolean {
  if (!lastActiveAt || !Number.isFinite(lastActiveAt)) return true;
  return now - lastActiveAt >= WELCOME_BACK_AFTER_MS;
}

/** Appel du robot : 5 touchers rapprochés (≤ 2,5 s, dans un rayon de 60 px) ; les touchers espacés ou éloignés ne comptent pas. */
export class TapSummonDetector {
  private taps: Array<{ x: number; y: number; t: number }> = [];
  constructor(private readonly needed = 5, private readonly windowMs = 2500, private readonly radius = 60) {}
  tap(x: number, y: number, t: number): boolean {
    this.taps = this.taps.filter((p) => t - p.t <= this.windowMs);
    const first = this.taps[0];
    if (first && Math.hypot(x - first.x, y - first.y) > this.radius) this.taps = [];
    this.taps.push({ x, y, t });
    if (this.taps.length >= this.needed) { this.taps = []; return true; }
    return false;
  }
  reset() { this.taps = []; }
}
