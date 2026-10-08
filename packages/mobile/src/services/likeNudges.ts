// Petits messages pour encourager à réagir (Adel, 05/10/2026, IDEA-109) : courts, mots de jeunes, jamais les mêmes (mémoire des derniers). Module pur.
// Bibliothèque (Adel, 06/10/2026) : plus de 100 000 messages différents par assemblage (accroche × corps × appel × emoji), mémoire des 60 derniers, et le bot SE SOUVIENT de l'avis déjà donné (RECALL_*).
export type NudgeKind = 'PLAYING' | 'SKIPPED' | 'AFTER_LIKE' | 'AFTER_DISLIKE' | 'AFTER_MEH' | 'ASK' | 'RECALL_LIKE' | 'RECALL_MEH' | 'RECALL_DISLIKE';

const HOT = ['🔥', '🙌', '💜', '✨', '🚀', '😎', '🎧', '💥', '🤩', '👌'];
const CALM = ['🤝', '✌️', '👍', '🎧', '🙏', '🙂', '🫡', '💬', '📝', '👌'];
const FUN = ['😉', '😏', '👀', '🔥', '✌️', '😎', '🙌', '💬'];

const OPENERS: Record<NudgeKind, string[]> = {
  PLAYING: ['Alors,', 'Dis-nous,', 'Franchement,', 'Petite question :', 'Hého,', 'Cash,', 'Sans filtre,', 'Entre nous,', 'Soyons clairs,', 'Allez,', 'Dis voir,', 'Tout de suite,'],
  SKIPPED: ['Oups,', 'Eh,', 'Wesh,', 'Dis donc,', 'Hop hop,', 'Tiens,', 'Psst,', 'Minute,', 'Hé,', 'Dis-moi,', 'Attends,', 'Petit détail :'],
  AFTER_LIKE: ['Yes !', 'Trop bien !', 'Ça, c’est fait ✅', 'Gros kiff !', 'Boom !', 'Parfait !', 'Top !', 'Reçu 5/5 !', 'Énorme !', 'Validé !', 'Nickel !', 'Bien vu !'],
  AFTER_DISLIKE: ['Noté,', 'Ok,', 'Pas de souci,', 'Compris,', 'C’est dit,', 'Bien reçu,', 'D’accord,', 'Merci,', 'Entendu,', 'Message reçu,', 'Aucun souci,', 'On retient :'],
  AFTER_MEH: ['Bof noté,', 'Ni oui ni non,', 'OK le juste milieu,', 'Reçu 5/5,', 'Tranquille,', 'Pas mal pas mal,', 'D’accord,', 'Compris,', 'Noté,', 'Bien reçu,', 'Mi-figue mi-raisin,', 'Ça va, ça vient,'],
  ASK: ['Donne ton avis', 'Ton avis ?', 'Alors, ton verdict ?', 'Dis-nous tout', 'À toi de juger', 'Un petit avis ?', 'Tu en penses quoi ?', 'Ton ressenti ?', 'Qu’en dis-tu ?', 'Ça donne quoi pour toi ?', 'On attend ton verdict', 'Ton petit mot ?', 'Verdict ?', 'Dis ce que tu ressens', 'Tu valides ?', 'Ton ❤ ou pas ?', 'Ton oreille en dit quoi ?', 'Fais-nous plaisir, réagis', 'Une réaction ?', 'Ton coup de cœur ?', 'Juge-la !', 'Ton impression ?', 'On t’écoute', 'À ton tour'],
  RECALL_LIKE: ['Tu l’avais déjà aimée,', 'Ton ❤ est toujours là,', 'Celle-ci, tu l’as kiffée,', 'Retrouvailles !', 'Déjà validée par toi,', 'Ton coup de cœur,', 'Tu t’en souviens ?', 'Une que tu aimes,', 'Un de tes ❤,', 'Souvenir sympa,', 'Elle t’avait plu,', 'Tu la connais déjà,'],
  RECALL_MEH: ['Tu l’avais notée « bof »,', 'Déjà entendue : bof,', 'Celle-ci t’avait laissé tiède,', 'Ton 😐 est gardé,', 'Tu l’avais jugée moyenne,', 'Souvenir mitigé,', 'Déjà notée,', 'Tu en pensais déjà ça,', 'Un de tes 😐,', 'Avis déjà donné,', 'Je m’en rappelle,', 'Elle t’avait laissé neutre,'],
  RECALL_DISLIKE: ['Tu l’avais écartée,', 'Celle-ci, pas ton style,', 'Déjà notée 👎,', 'Ton avis est gardé,', 'Tu l’avais mise de côté,', 'Je m’en rappelle,', 'Avis déjà donné,', 'Elle ne t’avait pas plu,', 'Un de tes 👎,', 'Souvenir pas top,', 'Tu en pensais déjà ça,', 'Déjà jugée,'],
};
const CORES: Record<NudgeKind, string[]> = {
  PLAYING: ['ça te fait vibrer ?', 'ça claque ou bof ?', 'c’est un banger ?', 'tu valides ce son ?', 'ça te parle ?', 'tu kiffes ?', 'ça tourne bien dans ta tête ?', 'tu la gardes en tête ?', 'ça t’électrise ?', 'tu dis oui ?', 'ça t’accroche l’oreille ?', 'tu la mets dans ton top ?'],
  SKIPPED: ['tu zappes sans rien dire ?', 'pas de réaction sur celle-là ?', 'tu n’as pas kiffé ?', 'c’était pas ton délire ?', 'tu passes à la suite sans avis ?', 'tu la laisses filer sans réaction ?', 'aucun avis sur celle-ci ?', 'tu n’as pas accroché ?', 'tu zappes déjà ?', 'pas de kiff, pas de bof ?', 'elle t’a laissé de marbre ?', 'tu n’as rien à en dire ?'],
  AFTER_LIKE: ['merci pour le ❤', 'ton ❤ nous aide à te trouver du son', 'on t’en cherche d’autres comme ça', 'le partageur va être content', 'ça va muscler tes recommandations', 'ton goût se précise', 'on note ton style', 'ça va nourrir ton Loki Pulse', 'tu viens de faire plaisir', 'on t’en prépare dans le même genre', 'ton oreille est notée', 'ce ❤ rejoint tes favoris'],
  AFTER_DISLIKE: ['c’est pas ton style', 'on évitera ce genre', 'on t’en trouve de meilleures', 'merci d’être franc', 'ça nous aide à mieux te connaître', 'on filtre ce style pour toi', 'ton goût se précise', 'on ajuste tes suggestions', 'franchise appréciée', 'on ne te le reproposera pas', 'on cherche mieux pour toi', 'ton avis compte'],
  AFTER_MEH: ['ça ne t’a pas fait vibrer', 'on affine ton goût', 'on cherche ce qui te fera kiffer', 'merci pour ton avis', 'ça aide à mieux te connaître', 'on garde ton demi-avis', 'on reste à l’écoute', 'on ajuste doucement', 'ni chaud ni froid, c’est utile', 'on tâtonne pour toi', 'on recentre tes suggestions', 'on devine ton style'],
  ASK: [''],
  RECALL_LIKE: ['tu peux changer d’avis d’un appui', 'elle reste dans tes favoris', 'on s’en sert pour te recommander mieux', 'ton ❤ compte toujours', 'ravie de te la remontrer', 'elle fait partie de ton style', 'toujours aussi bonne ?', 'on la garde au chaud pour toi', 'ça valait le coup de la revoir', 'tu peux la retirer si tu veux', 'elle t’a marqué', 'ton oreille ne s’est pas trompée'],
  RECALL_MEH: ['tu peux changer d’avis d’un appui', 'une deuxième écoute peut tout changer', 'ton 😐 reste pris en compte', 'toujours tiède ?', 'ça mérite peut-être mieux', 'tu peux retirer ton avis', 'on garde ta nuance', 'elle t’a laissé mitigé', 'tu peux la réévaluer', 'rien ne t’oblige à rester sur bof', 'ton avis reste modifiable', 'à toi de voir'],
  RECALL_DISLIKE: ['tu peux changer d’avis d’un appui', 'une seconde chance ?', 'ton 👎 reste pris en compte', 'toujours pas convaincu ?', 'on évite ce genre pour toi', 'tu peux retirer ton avis', 'elle ne passe pas', 'ton avis reste modifiable', 'tu peux la réévaluer', 'rien ne t’oblige à rester dessus', 'on ne t’en parle plus sinon', 'à toi de voir'],
};
const CLOSERS: Record<NudgeKind, string[]> = {
  PLAYING: ['Balance un ❤ !', 'Un petit ❤ ? 🔥', '❤ si t’aimes, 😐 bof, 👎 sinon.', 'Montre-le avec un ❤ 👀', 'Appuie sur le ❤ !', 'Un ❤, un 😐 ou un 👎 ?', 'Réagis en un appui ❤', 'Dis-le avec ❤ 😐 👎', 'Ton ❤ fait grandir ta communauté.', 'Choisis : ❤ 😐 ou 👎.'],
  SKIPPED: ['Dis-le : ❤, 😐 ou 👎 😅', '❤, 😐 ou 👎, ça aide !', 'Dis-nous pourquoi : ❤ 😐 👎.', 'Un petit 😐 ou 👎 ça ne mord pas.', 'Réagis la prochaine fois ❤', 'Un ❤ ou un 👎 suffit.', 'Ça prend une seconde : ❤ 😐 👎.', 'Ton ❤ ou ton 👎 compte vraiment.', 'On veut ton avis : ❤ 😐 👎.', 'Dis-le avec un ❤ ou un 👎 !'],
  AFTER_LIKE: ['Bravo à toi.', 'Continue comme ça.', 'On avance ensemble.', 'Belle trouvaille.', 'Allez, la suivante.', 'Ça se précise.', 'Joli choix.', 'C’est noté.', 'Merci à toi.', 'Quelle oreille !'],
  AFTER_DISLIKE: ['Merci d’être honnête.', 'Allez, la suivante.', 'On continue.', 'Pas grave.', 'Ça arrive.', 'Cap sur mieux.', 'C’est noté.', 'On trouve mieux.', 'Suite du programme.', 'Merci à toi.'],
  AFTER_MEH: ['On continue.', 'Allez, la suivante.', 'C’est noté.', 'Pas grave.', 'Suite du programme.', 'Merci à toi.', 'On trouve mieux.', 'Cap sur la suite.', 'Ça arrive.', 'À la prochaine.'],
  ASK: ['', '', '', '', '', '', '', '', '', '', '', ''],
  RECALL_LIKE: ['Profites-en.', 'Bonne écoute.', 'Quel goût !', 'Toujours de bon goût.', 'On continue ?', 'Belle fidélité.', 'Savoure.', 'Écoute-la bien.', 'Ça se confirme ?', 'C’est ton truc.'],
  RECALL_MEH: ['Écoute bien.', 'Laisse-lui sa chance.', 'On continue ?', 'À toi de décider.', 'Prends ton temps.', 'Tout reste possible.', 'Écoute encore.', 'Même un bof change.', 'Libre à toi.', 'Quand tu veux.'],
  RECALL_DISLIKE: ['Tu peux zapper.', 'Passe si tu veux.', 'On continue ?', 'À toi de décider.', 'Prends ton temps.', 'Tout reste possible.', 'Libre à toi.', 'Quand tu veux.', 'Zappe sans regret.', 'Simple à changer.'],
};
const TAILS: Record<NudgeKind, string[]> = {
  PLAYING: FUN, SKIPPED: FUN, AFTER_LIKE: HOT, AFTER_DISLIKE: CALM, AFTER_MEH: CALM, ASK: FUN, RECALL_LIKE: HOT, RECALL_MEH: CALM, RECALL_DISLIKE: CALM,
};
const ASK_MARKS = ['', ' !', ' 👇', ' ⬇️', ' ?', ' …', ' ✨', ' 🎤'];

// Langage de jeunes selon le genre (Adel, 06/10/2026) : « wesh poto » pour un homme, « wesh meuf » pour une femme, neutre sinon. Toujours poli, avec un smiley.
export type NudgeAudience = 'M' | 'F' | 'N';
export type NudgeTone = 'NORMAL' | 'GRUMPY';
const ADDRESS: Record<NudgeAudience, string[]> = {
  M: ['Wesh poto,', 'Wesh frérot,', 'Eh mon pote,', 'Yo bro,', 'Wesh le s,', 'Hé champion,', 'Wesh mon gars,', 'Eh le king,', 'Hé le boss,', 'Wesh mon frère,', 'Eh l’ami,', 'Wesh champion,'],
  F: ['Wesh meuf,', 'Eh ma belle,', 'Wesh ma reine,', 'Hey sista,', 'Wesh ma grande,', 'Eh miss,', 'Wesh la star,', 'Hé championne,', 'Eh la reine,', 'Wesh ma chérie,', 'Hé la miss,', 'Wesh ma puce,'],
  N: ['Hého,', 'Dis donc,', 'Psst,', 'Eh toi,', 'Salut l’artiste,', 'Hey,', 'Coucou,', 'Dis voir,', 'Hé hé,', 'Allô,', 'Oh,', 'Tiens tiens,'],
};
/** Ton qui monte quand l'utilisateur swipe sans jamais donner son avis : on le reprend gentiment, jamais méchamment. */
const GRUMPY: { openers: string[]; cores: string[]; closers: string[]; tails: string[] } = {
  openers: ['Bon,', 'Alors là,', 'Sérieux,', 'Dis-moi,', 'Franchement,', 'Allez,', 'Stop,', 'Attends,', 'Oh,', 'Un instant,'],
  cores: ['t’es de mauvaise humeur aujourd’hui ?', 'tu boudes ou quoi ?', 'tu n’as envie de donner ton avis sur rien ?', 'aucun ❤ depuis tout à l’heure, ça va ?', 'tu fais la tête ? Même un 😐 nous ferait plaisir', 'tu écoutes tout sans rien dire, c’est pas sympa', 'tu nous laisses sans réponse depuis plusieurs musiques', 'on te demande juste un petit pouce, pas un contrat', 'tu fais ton timide ?', 'tu gardes tes avis pour toi, hein ?', 'même un 👎 sincère, on prend', 'allez, un petit effort'],
  closers: ['Un ❤, un 😐 ou un 👎 : choisis !', 'Réagis, on ne te mord pas.', 'Fais-nous plaisir, appuie.', 'C’est gratuit et ça aide tout le monde.', 'Ton avis nous rend meilleurs.', 'Promis, on est gentils.', 'Un appui et on te laisse tranquille.', 'Dis ce que tu penses vraiment.', 'Ça prend une seconde.', 'On compte sur toi.'],
  tails: ['😤', '😏', '🙄', '😅', '🫣', '😉', '🤨', '👀'],
};

const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  // Brassage final : sans lui, deux listes de même taille choisissent des éléments corrélés (peu de combinaisons réelles).
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
};

// Un point d'interrogation ou d'exclamation déjà présent n'est jamais doublé (« ? ! »).
const askOpener = (opener: string, mark: string) => (/[?!…]$/.test(opener) || /[\p{Extended_Pictographic}]/u.test(opener) ? opener : `${opener}${mark}`);

/** Compose un message ; `recent` = derniers messages affichés (on évite de les répéter). `audience` = genre pour l'adresse, `tone` = ton qui monte si l'avis manque. */
export function composeNudge(kind: NudgeKind, seed: string, recent: string[] = [], opts: { audience?: NudgeAudience; tone?: NudgeTone } = {}): string {
  const pick = (list: string[], salt: string, offset: number) => list[(hash(`${seed}:${salt}`) + offset) % list.length];
  const audience = opts.audience ?? 'N';
  const addressed = kind === 'PLAYING' || kind === 'SKIPPED' || kind === 'ASK';
  const grumpy = opts.tone === 'GRUMPY' && (kind === 'PLAYING' || kind === 'SKIPPED');
  let line = '';
  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (grumpy) {
      line = `${pick(ADDRESS[audience], 'a', attempt)} ${pick(GRUMPY.cores, 'c', attempt * 3)} ${pick(GRUMPY.closers, 'e', attempt * 7)} ${pick(GRUMPY.tails, 't', attempt * 11)}`;
    } else if (kind === 'ASK') {
      line = `${askOpener(pick(OPENERS.ASK, 'o', attempt), pick(ASK_MARKS, 'm', attempt * 5))} ${pick(TAILS.ASK, 'e', attempt * 7)}`;
    } else {
      const base = `${pick(OPENERS[kind], 'o', attempt)} ${pick(CORES[kind], 'c', attempt * 3)} ${pick(CLOSERS[kind], 'e', attempt * 7)} ${pick(TAILS[kind], 't', attempt * 11)}`;
      // L'adresse « wesh poto / wesh meuf » remplace l'accroche une fois sur deux (pas à chaque message : le robot reste naturel).
      line = addressed && (hash(`${seed}:adr`) % 2 === 0) ? base.replace(pick(OPENERS[kind], 'o', attempt), pick(ADDRESS[audience], 'a', attempt)) : base;
    }
    if (!recent.includes(line)) return line;
  }
  return line;
}

export const nudgeCombinationCount = (kind: NudgeKind): number => (kind === 'ASK' ? OPENERS.ASK.length * ASK_MARKS.length * TAILS.ASK.length : OPENERS[kind].length * CORES[kind].length * CLOSERS[kind].length * TAILS[kind].length);
/** Total de messages différents que la bibliothèque sait composer : tous types, les 3 adresses (homme / femme / neutre) et le ton « il boude ». */
export const nudgeLibrarySize = (): number => {
  const base = (Object.keys(OPENERS) as NudgeKind[]).reduce((sum, kind) => sum + nudgeCombinationCount(kind), 0);
  const addressed = (['PLAYING', 'SKIPPED', 'ASK'] as NudgeKind[]).reduce((sum, kind) => sum + nudgeCombinationCount(kind) * ADDRESS.N.length * 3, 0);
  const grumpy = 2 * 3 * ADDRESS.N.length * GRUMPY.cores.length * GRUMPY.closers.length * GRUMPY.tails.length;
  return base + addressed + grumpy;
};

/** Mémoire des 60 derniers messages montrés (jamais deux fois le même d'affilée, ni de près). */
const recentShown: string[] = [];
export function nextNudge(kind: NudgeKind, opts: { audience?: NudgeAudience; tone?: NudgeTone } = {}): string {
  const line = composeNudge(kind, `${Date.now()}:${Math.floor(Math.random() * 1e9)}`, recentShown, opts);
  recentShown.push(line);
  if (recentShown.length > 60) recentShown.shift();
  return line;
}

// Remerciement par son nom ; sans partageur connu : « Merci toi ».
const THANKS: Record<'LIKE' | 'MEH' | 'DISLIKE', string[]> = {
  LIKE: ['{n} te remercie pour ton ❤ 🙌', 'Un grand merci de {n} 💜', '{n} est trop content de ton ❤ 🔥', 'Merci de la part de {n}, ton ❤ compte !', '{n} te dit merci pour ton ❤ ✨'],
  MEH: ['{n} te remercie pour ton avis honnête 🙂', 'Merci pour ta franchise, dit {n} 🤝', '{n} note ton bof et te remercie 🎧', '{n} apprécie ton avis, merci 🙏'],
  DISLIKE: ['{n} te remercie pour ta franchise 🤝', 'Merci pour ton avis sincère, dit {n} ✌️', '{n} prend note et te remercie 🙏', '{n} te dit merci, ça aide à s’améliorer 🎧'],
};
const SELF_THANKS: Record<'LIKE' | 'MEH' | 'DISLIKE', string[]> = {
  LIKE: ['Merci {n} pour ton ❤ 🙌', 'Gros merci {n} ! Ton ❤ nous aide 🔥', 'Merci {n}, on t’en cherche d’autres comme ça 🚀'],
  MEH: ['Merci {n} pour ton avis 🙂', 'Merci {n}, on affine ton goût 🎧'],
  DISLIKE: ['Merci {n} pour ta franchise 🤝', 'Merci {n}, on t’en trouve de meilleures ✌️'],
};
export function composeThanks(reaction: 'LIKE' | 'MEH' | 'DISLIKE', seed: string, from: string | null | undefined, me: string | null | undefined, recent: string[] = []): string {
  const sharer = displayUsername(from);
  const list = sharer ? THANKS[reaction] : SELF_THANKS[reaction];
  const name = sharer || displayUsername(me) || 'toi';
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
  if (recentShown.length > 60) recentShown.shift();
  return line;
}
import { displayUsername } from '../utils/displayUsername';
