// Petits messages pour encourager à réagir (Adel, 05/10/2026, IDEA-109) : courts, mots de jeunes, jamais les mêmes (mémoire des derniers). Module pur.
export type NudgeKind = 'PLAYING' | 'SKIPPED' | 'AFTER_LIKE' | 'AFTER_DISLIKE' | 'AFTER_MEH';

const OPENERS: Record<NudgeKind, string[]> = {
  PLAYING: ['Alors,', 'Dis-nous,', 'Franchement,', 'Petite question :', 'Hého,', 'Cash,'],
  SKIPPED: ['Oups,', 'Eh,', 'Wesh,', 'Dis donc,', 'Hop hop,'],
  AFTER_LIKE: ['Yes !', 'Trop bien !', 'Ça, c’est fait ✅', 'Gros kiff !', 'Boom !'],
  AFTER_DISLIKE: ['Noté,', 'Ok,', 'Pas de souci,', 'Compris,', 'C’est dit,'],
  AFTER_MEH: ['Bof noté,', 'Ni oui ni non,', 'OK le juste milieu,', 'Reçu 5/5,', 'Tranquille,'],
};
const CORES: Record<NudgeKind, string[]> = {
  PLAYING: ['ça te fait vibrer ?', 'ça claque ou bof ?', 'c’est un banger ?', 'tu valides ce son ?', 'ça te parle ?', 'tu kiffes ?'],
  SKIPPED: ['tu zappes sans rien dire ?', 'pas de réaction sur celle-là ?', 'tu n’as pas kiffé ?', 'c’était pas ton délire ?', 'tu passes à la suite sans avis ?'],
  AFTER_LIKE: ['merci pour le ❤', 'ton ❤ nous aide à te trouver du son', 'on t’en cherche d’autres comme ça', 'le partageur va être content', 'ça va muscler tes recommandations'],
  AFTER_DISLIKE: ['c’est pas ton style', 'on évitera ce genre', 'on t’en trouve de meilleures', 'merci d’être franc', 'ça nous aide à mieux te connaître'],
  AFTER_MEH: ['ça ne t’a pas fait vibrer', 'on affine ton goût', 'on cherche ce qui te fera kiffer', 'merci pour ton avis', 'ça aide à mieux te connaître'],
};
const CLOSERS: Record<NudgeKind, string[]> = {
  PLAYING: ['Balance un ❤ !', 'Un petit ❤ ? 🔥', '❤ si t’aimes, 😐 bof, 👎 sinon.', 'Montre-le avec un ❤ 👀', 'Appuie sur le ❤ !'],
  SKIPPED: ['Dis-le : ❤, 😐 ou 👎 😅', '❤, 😐 ou 👎, ça aide !', 'Dis-nous pourquoi : ❤ 😐 👎.', 'Un petit 😐 ou 👎 ça ne mord pas.', 'Réagis la prochaine fois ✌️'],
  AFTER_LIKE: ['🔥', '🙌', '💜', '✨', '🚀'],
  AFTER_DISLIKE: ['🤝', '✌️', '👍', '🎧', '🙏'],
  AFTER_MEH: ['😐', '🤷', '🎧', '✌️', '🙂'],
};

const hash = (text: string) => { let h = 2166136261; for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** Compose un message ; `recent` = derniers messages affichés (on évite de les répéter). */
export function composeNudge(kind: NudgeKind, seed: string, recent: string[] = []): string {
  const pick = (list: string[], salt: string, offset: number) => list[(hash(`${seed}:${salt}`) + offset) % list.length];
  let line = '';
  for (let attempt = 0; attempt < 12; attempt += 1) {
    line = `${pick(OPENERS[kind], 'o', attempt)} ${pick(CORES[kind], 'c', attempt * 3)} ${pick(CLOSERS[kind], 'e', attempt * 7)}`;
    if (!recent.includes(line)) return line;
  }
  return line;
}

export const nudgeCombinationCount = (kind: NudgeKind): number => OPENERS[kind].length * CORES[kind].length * CLOSERS[kind].length;

/** Mémoire courte (les 8 derniers messages montrés) pour ne jamais répéter. */
const recentShown: string[] = [];
export function nextNudge(kind: NudgeKind): string {
  const line = composeNudge(kind, `${Date.now()}:${Math.floor(Math.random() * 1e9)}`, recentShown);
  recentShown.push(line);
  if (recentShown.length > 8) recentShown.shift();
  return line;
}
