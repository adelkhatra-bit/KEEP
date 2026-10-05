// Petits messages pour encourager à réagir (Adel, 05/10/2026, IDEA-109) : courts, mots de jeunes, jamais les mêmes (mémoire des derniers). Module pur.
export type NudgeKind = 'PLAYING' | 'SKIPPED' | 'AFTER_LIKE' | 'AFTER_DISLIKE' | 'AFTER_MEH' | 'ASK';

const ASK_OPENERS = ['Donne ton avis', 'Ton avis ?', 'Alors, ton verdict ?', 'Dis-nous tout', 'À toi de juger', 'Un petit avis ?', 'Tu en penses quoi ?', 'Ton ressenti ?'];
const ASK_CLOSERS = ['😉', '😏', '👀', '🔥', '✌️', '😎', '🙌', '💬'];

const OPENERS: Record<NudgeKind, string[]> = {
  PLAYING: ['Alors,', 'Dis-nous,', 'Franchement,', 'Petite question :', 'Hého,', 'Cash,'],
  SKIPPED: ['Oups,', 'Eh,', 'Wesh,', 'Dis donc,', 'Hop hop,'],
  AFTER_LIKE: ['Yes !', 'Trop bien !', 'Ça, c’est fait ✅', 'Gros kiff !', 'Boom !'],
  AFTER_DISLIKE: ['Noté,', 'Ok,', 'Pas de souci,', 'Compris,', 'C’est dit,'],
  AFTER_MEH: ['Bof noté,', 'Ni oui ni non,', 'OK le juste milieu,', 'Reçu 5/5,', 'Tranquille,'],
  ASK: ASK_OPENERS,
};
const CORES: Record<NudgeKind, string[]> = {
  PLAYING: ['ça te fait vibrer ?', 'ça claque ou bof ?', 'c’est un banger ?', 'tu valides ce son ?', 'ça te parle ?', 'tu kiffes ?'],
  SKIPPED: ['tu zappes sans rien dire ?', 'pas de réaction sur celle-là ?', 'tu n’as pas kiffé ?', 'c’était pas ton délire ?', 'tu passes à la suite sans avis ?'],
  AFTER_LIKE: ['merci pour le ❤', 'ton ❤ nous aide à te trouver du son', 'on t’en cherche d’autres comme ça', 'le partageur va être content', 'ça va muscler tes recommandations'],
  AFTER_DISLIKE: ['c’est pas ton style', 'on évitera ce genre', 'on t’en trouve de meilleures', 'merci d’être franc', 'ça nous aide à mieux te connaître'],
  AFTER_MEH: ['ça ne t’a pas fait vibrer', 'on affine ton goût', 'on cherche ce qui te fera kiffer', 'merci pour ton avis', 'ça aide à mieux te connaître'],
  ASK: [''],
};
const CLOSERS: Record<NudgeKind, string[]> = {
  PLAYING: ['Balance un ❤ !', 'Un petit ❤ ? 🔥', '❤ si t’aimes, 😐 bof, 👎 sinon.', 'Montre-le avec un ❤ 👀', 'Appuie sur le ❤ !'],
  SKIPPED: ['Dis-le : ❤, 😐 ou 👎 😅', '❤, 😐 ou 👎, ça aide !', 'Dis-nous pourquoi : ❤ 😐 👎.', 'Un petit 😐 ou 👎 ça ne mord pas.', 'Réagis la prochaine fois ✌️'],
  AFTER_LIKE: ['🔥', '🙌', '💜', '✨', '🚀'],
  AFTER_DISLIKE: ['🤝', '✌️', '👍', '🎧', '🙏'],
  AFTER_MEH: ['😐', '🤷', '🎧', '✌️', '🙂'],
  ASK: ASK_CLOSERS,
};

const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  // Brassage final : sans lui, deux listes de même taille choisissent des éléments corrélés (peu de combinaisons réelles).
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
};

/** Compose un message ; `recent` = derniers messages affichés (on évite de les répéter). */
export function composeNudge(kind: NudgeKind, seed: string, recent: string[] = []): string {
  const pick = (list: string[], salt: string, offset: number) => list[(hash(`${seed}:${salt}`) + offset) % list.length];
  let line = '';
  for (let attempt = 0; attempt < 12; attempt += 1) {
    line = kind === 'ASK'
      ? `${pick(OPENERS.ASK, 'o', attempt)} ${pick(CLOSERS.ASK, 'e', attempt * 7)}`
      : `${pick(OPENERS[kind], 'o', attempt)} ${pick(CORES[kind], 'c', attempt * 3)} ${pick(CLOSERS[kind], 'e', attempt * 7)}`;
    if (!recent.includes(line)) return line;
  }
  return line;
}

export const nudgeCombinationCount = (kind: NudgeKind): number => (kind === 'ASK' ? OPENERS.ASK.length * CLOSERS.ASK.length : OPENERS[kind].length * CORES[kind].length * CLOSERS[kind].length);

/** Mémoire courte (les 8 derniers messages montrés) pour ne jamais répéter. */
const recentShown: string[] = [];
export function nextNudge(kind: NudgeKind): string {
  const line = composeNudge(kind, `${Date.now()}:${Math.floor(Math.random() * 1e9)}`, recentShown);
  recentShown.push(line);
  if (recentShown.length > 8) recentShown.shift();
  return line;
}

// Remerciement PAR SON NOM (Adel 05/10/2026) : « @bruno te remercie pour ton ❤ 🙌 » — signe de politesse ; sans partageur connu : « Merci @toi ».
const THANKS: Record<'LIKE' | 'MEH' | 'DISLIKE', string[]> = {
  LIKE: ['@{n} te remercie pour ton ❤ 🙌', 'Un grand merci de @{n} 💜', '@{n} est trop content de ton ❤ 🔥', 'Merci de la part de @{n}, ton ❤ compte !', '@{n} te dit merci pour ton ❤ ✨'],
  MEH: ['@{n} te remercie pour ton avis honnête 🙂', 'Merci pour ta franchise, dit @{n} 🤝', '@{n} note ton bof et te remercie 🎧', '@{n} apprécie ton avis, merci 🙏'],
  DISLIKE: ['@{n} te remercie pour ta franchise 🤝', 'Merci pour ton avis sincère, dit @{n} ✌️', '@{n} prend note et te remercie 🙏', '@{n} te dit merci, ça aide à s’améliorer 🎧'],
};
const SELF_THANKS: Record<'LIKE' | 'MEH' | 'DISLIKE', string[]> = {
  LIKE: ['Merci @{n} pour ton ❤ 🙌', 'Gros merci @{n} ! Ton ❤ nous aide 🔥', 'Merci @{n}, on t’en cherche d’autres comme ça 🚀'],
  MEH: ['Merci @{n} pour ton avis 🙂', 'Merci @{n}, on affine ton goût 🎧'],
  DISLIKE: ['Merci @{n} pour ta franchise 🤝', 'Merci @{n}, on t’en trouve de meilleures ✌️'],
};
export function composeThanks(reaction: 'LIKE' | 'MEH' | 'DISLIKE', seed: string, from: string | null | undefined, me: string | null | undefined, recent: string[] = []): string {
  const clean = (value?: string | null) => String(value ?? '').trim().replace(/^@+/, '');
  const sharer = clean(from);
  const list = sharer ? THANKS[reaction] : SELF_THANKS[reaction];
  const name = sharer || clean(me) || 'toi';
  let line = '';
  for (let attempt = 0; attempt < list.length; attempt += 1) {
    line = list[(hash(`${seed}:t`) + attempt) % list.length].replace('{n}', name);
    if (!recent.includes(line)) return line;
  }
  return line;
}
export function nextThanks(reaction: 'LIKE' | 'MEH' | 'DISLIKE', from: string | null | undefined, me: string | null | undefined): string {
  const line = composeThanks(reaction, `${Date.now()}:${Math.floor(Math.random() * 1e9)}`, from, me, recentShown);
  recentShown.push(line);
  if (recentShown.length > 8) recentShown.shift();
  return line;
}
