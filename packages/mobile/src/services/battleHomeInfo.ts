// Adel (29/09/2026) : refonte de l'accueil Battle / Solo.
// Fonctions pures (testables sans React Native) utilisées par
// KeepBattleMobileGameV3 : couleur des réponses, quota Solo lisible, date de
// recharge mensuelle des Free et texte d'encouragement de chaque morceau.

export type AnswerVisualState = 'idle' | 'correct' | 'wrong';

// Compare deux libellés d'artiste sans tenir compte de la casse ni des espaces
// autour : le pack Solo ajoute la bonne réponse en comparant sans casse
// (keepBattleExperienceService), l'affichage et la correction doivent faire
// pareil, sinon la bonne réponse n'est ni verte ni comptée juste.
export function sameAnswer(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

// Bug Adel (29/09/2026) : « j'ai appuyé sur la mauvaise réponse, j'avais pas
// la mauvaise réponse en rouge ». Une fois la manche tranchée : la bonne
// réponse est TOUJOURS verte, la réponse choisie si elle est fausse est
// TOUJOURS rouge, les autres restent neutres.
export function answerVisualState(choice: string, correctAnswer: string, selected: string | null, answered: boolean): AnswerVisualState {
  if (!answered) return 'idle';
  if (sameAnswer(choice, correctAnswer)) return 'correct';
  if (selected && sameAnswer(choice, selected)) return 'wrong';
  return 'idle';
}

// Déduplique les 4 réponses affichées par libellé visible. Si deux choix ont
// le même libellé, on garde TOUJOURS la bonne réponse, jamais son doublon :
// sinon le joueur pouvait taper le bon nom et être compté faux.
export function dedupeAnswerChoices(choices: string[], correctAnswer: string, label: (value: string) => string, max = 4): string[] {
  const byLabel = new Map<string, string>();
  for (const choice of choices) {
    if (!choice) continue;
    const key = label(choice).trim().toLocaleLowerCase();
    const kept = byLabel.get(key);
    if (!kept || (!sameAnswer(kept, correctAnswer) && sameAnswer(choice, correctAnswer))) byLabel.set(key, choice);
  }
  return Array.from(byLabel.values()).slice(0, max);
}

export type SoloDailyStatusLike = { limit: number | null; remaining: number | null; unlimited: boolean; resetsAt?: string | null; plan?: string; dailyIncluded?: number | null; purchasedRemaining?: number | null };

function hhmm(iso: string | null | undefined): string {
  if (!iso) return '00:00';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '00:00';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Texte du quota Solo (hors des boutons, au-dessus, à côté de la recharge
// des Free). Adel (29/09/2026) : « il en fait un, il sait qu'il lui en reste
// neuf… illimité s'il a une formule ».
export function soloQuotaCopy(status: SoloDailyStatusLike | null): { headline: string; detail: string; exhausted: boolean } | null {
  if (!status) return null;
  if (status.unlimited) return { headline: 'Solos disponibles : illimités', detail: 'aucun compteur à épuiser', exhausted: false };
  const remaining = Math.max(0, status.remaining ?? 0);
  const dayEnd = status.resetsAt ? `journée Battle jusqu’à ${hhmm(status.resetsAt)}` : 'compteur actuel';
  if (remaining <= 0) return { headline: '0 Solo disponible', detail: dayEnd, exhausted: true };
  return { headline: `${remaining} Solo${remaining > 1 ? 's' : ''} disponible${remaining > 1 ? 's' : ''}`, detail: dayEnd, exhausted: false };
}

// Règle par profil, affichée sous la recharge : combien de Solos par jour.
// Adel (30/09/2026) : chaque formule garde sa limite, mais préparer un Solo
// ne consomme rien. Le quota est engagé au premier extrait réellement joué.
export function soloPlanRuleCopy(status: SoloDailyStatusLike | null, purchasedFallback = 0): { short: string; full: string } | null {
  if (!status) return null;
  if (status.unlimited) return { short: 'Solos disponibles : illimités', full: 'Ton compte permet de lancer des parties Solo sans compteur à épuiser.' };

  const purchased = Math.max(0, status.purchasedRemaining ?? purchasedFallback ?? 0);
  const totalLimit = Math.max(0, status.limit ?? 0);
  const dailyIncluded = Math.max(0, status.dailyIncluded ?? (totalLimit - purchased));
  const remaining = Math.max(0, status.remaining ?? 0);

  return {
    short: purchased > 0
      ? `Disponibles : ${remaining} · dont ${purchased} acheté${purchased > 1 ? 's' : ''}`
      : `Disponibles : ${remaining} · quota du jour ${dailyIncluded}`,
    full: `Quota du jour : ${dailyIncluded} Solo${dailyIncluded > 1 ? 's' : ''}. À 02:00, ce quota quotidien revient simplement à ${dailyIncluded} : ce n’est pas un achat et aucun pack n’est renouvelé automatiquement. `
      + (purchased > 0
        ? `Stock acheté restant : ${purchased} Solo${purchased > 1 ? 's' : ''}. Ce stock reste sur ton compte jusqu’à utilisation et s’ajoute au quota du jour. `
        : '')
      + 'Les deux packs disponibles créditent immédiatement 10 ou 25 Solos. Chaque partie consomme 1 Solo. Quand les Solos achetés sont épuisés, il faut acheter un nouveau pack.',
  };
}

// Miroir exact de public.keep_monthly_free_bonus_for_profile : le bonus
// mensuel de Free est crédité tous les 30 jours à partir de la création du
// profil (floor((now - created_at) / 30 j)). La prochaine recharge tombe donc
// à created_at + (mois écoulés + 1) × 30 jours.
const MONTH_MS = 30 * 86400 * 1000;
export function nextMonthlyFreeRecharge(profileCreatedAt: string | null | undefined, nowMs = Date.now()): Date | null {
  if (!profileCreatedAt) return null;
  const created = new Date(profileCreatedAt).getTime();
  if (Number.isNaN(created)) return null;
  const elapsed = Math.max(0, nowMs - created);
  return new Date(created + (Math.floor(elapsed / MONTH_MS) + 1) * MONTH_MS);
}

export function formatFreeRecharge(next: Date | null, monthlyBonus: number): string | null {
  if (!next || monthlyBonus <= 0) return null;
  const day = String(next.getDate()).padStart(2, '0');
  const month = String(next.getMonth() + 1).padStart(2, '0');
  return `+${monthlyBonus} Free le ${day}/${month}`;
}

// Adel (29/09/2026) : « chaque musique qui va défiler, tu me mets un texte
// particulier… courage ». Un message par morceau, jamais deux fois le même
// d'affilée, le dernier morceau a son propre message.
export const SOLO_ENCOURAGEMENTS = [
  'Courage, tu tiens le rythme !',
  'Concentre-toi, écoute bien…',
  'Tu peux le faire !',
  'Garde la tête froide 🎧',
  'Fais confiance à ton oreille',
  'Encore un effort !',
  'Le Free est à portée de main',
  'On lâche rien !',
];

export function soloEncouragement(roundIndex: number, totalRounds: number): string {
  if (roundIndex <= 0) return 'C’est parti, bonne chance !';
  if (totalRounds > 1 && roundIndex === totalRounds - 1) return 'Dernier morceau, tout se joue maintenant !';
  return SOLO_ENCOURAGEMENTS[(roundIndex - 1) % SOLO_ENCOURAGEMENTS.length];
}

// Adel (29/09/2026) : « s'il sort au bout de la 3e musique, est-ce que ça
// lui débite bien sa partie Solo, et est-ce qu'un popup le prévient ? ».
// Le serveur compte la partie seulement quand le PREMIER extrait audio a
// réellement démarré. Préparer/ouvrir un Solo ne consomme rien ; quitter
// après le premier morceau démarré ne rend pas la partie. `status` = statut
// lu avant le départ.
export function soloCostNotice(status: SoloDailyStatusLike | null): string | null {
  if (!status || status.unlimited) return null;
  const limit = Math.max(0, status.limit ?? 0);
  const after = Math.max(0, (status.remaining ?? 0) - 1);
  return `Dès que la première musique démarre, cette partie utilise 1 Solo du jour : il t'en restera ${after} sur ${limit}. Si tu quittes ensuite, elle reste comptée.`;
}

// `status` = statut serveur APRES l'engagement du premier audio : remaining
// contient déjà le Solo consommé. Ne jamais soustraire une seconde fois dans
// le message de sortie.
// Adel (02/10/2026, retour d'un joueur) : dire aussi qu'abandonner pèse sur
// le classement — les abandons y sont comptés.
export const ABANDON_RANKING_NOTE = 'Abandonner compte aussi dans ton classement : va au bout de tes parties pour garder une bonne place.';

export function soloQuitNotice(status: SoloDailyStatusLike | null): string {
  if (!status || status.unlimited) return `Ta partie en cours sera perdue (aucun Free gagné). ${ABANDON_RANKING_NOTE}`;
  const limit = Math.max(0, status.limit ?? 0);
  const left = Math.max(0, status.remaining ?? 0);
  return `Cette partie Solo est déjà comptée et ne sera pas rendue. Il te restera ${left} Solo${left > 1 ? 's' : ''} sur ${limit} aujourd'hui, et tu ne gagnes aucun Free sur cette partie. ${ABANDON_RANKING_NOTE}`;
}

// Adel (29/09/2026) : « qu'on sache pourquoi on a gagné… même résultat
// musical mais plus rapide ? ». Une seule phrase courte, calculée à partir
// du classement du match (placement 1 contre placement 2).
export type MatchResultLike = { username: string; placement: number; correct: number; responseMs: number };
export function battleWinReason(results: MatchResultLike[] | null | undefined): string | null {
  if (!results || results.length < 2) return null;
  const sorted = [...results].sort((a, b) => a.placement - b.placement);
  const [w, r] = sorted;
  if (w.correct > r.correct) return `🎯 Gagné aux bonnes réponses · ${w.correct} contre ${r.correct}`;
  if (w.correct === r.correct) {
    const ws = (w.responseMs / 1000).toFixed(1);
    const rs = (r.responseMs / 1000).toFixed(1);
    return `⚡ Égalité à ${w.correct} bonne${w.correct > 1 ? 's' : ''} réponse${w.correct > 1 ? 's' : ''} · ${w.username} plus rapide (${ws} s contre ${rs} s)`;
  }
  return '⚡ Gagné aux points : les réponses les plus rapides rapportent plus';
}

// Solo laissé tout seul : 2 morceaux d'affilée sans réponse (depuis la
// dernière reprise) -> « Tu es toujours là ? ». Adel (02/10/2026) : « une
// personne peut prendre un appel urgent » -> 60 s au lieu de 20 s.
export const SOLO_IDLE_AUTO_CLOSE_MS = 60_000;

// Texte exact de la fenêtre « Tu es toujours là ? » : ce qui se passe si
// personne ne répond. Le Solo ne retire JAMAIS de Free (aucun débit côté
// serveur) : il compte seulement dans les Solos du jour.
export function soloIdleNotice(secondsLeft: number, status: SoloDailyStatusLike | null): string {
  const s = Math.max(0, Math.ceil(secondsLeft));
  const counted = !status || status.unlimited
    ? 'la partie s’arrête sans Free gagné'
    : `la partie s’arrête et compte dans tes Solos du jour (il t’en restera ${Math.max(0, status.remaining ?? 0)} sur ${Math.max(0, status.limit ?? 0)}), sans Free gagné`;
  return `Personne n’a répondu aux 2 derniers morceaux. Sans réponse dans ${s} s, ${counted}. Aucun Free n’est retiré de ton solde.`;
}

// Battle en ligne : 3 questions d'affilée sans réponse = sortie de la partie
// et mise perdue (règle serveur, Adel 02/09/2026). Adel (02/10/2026) : « il
// faut bien marquer que là il va y avoir 3 Free débités » -> avertissement
// dès la 2e question manquée.
export const ARENA_AFK_LIMIT = 3;
export function arenaMissWarning(missStreak: number, stake: number): string | null {
  if (missStreak < ARENA_AFK_LIMIT - 1 || missStreak >= ARENA_AFK_LIMIT) return null;
  return `⚠️ ${missStreak} questions sans réponse : encore une et tu sors du Battle, −${stake} Free débités.`;
}
export function soloIdleDetected(responses: string[], resumeIndex: number): boolean {
  const recent = responses.slice(Math.max(0, resumeIndex));
  if (recent.length < 2) return false;
  return recent.slice(-2).every((r) => r === '__TIMEOUT__');
}

// Phrase de Loki (mascotte) en fin de Solo : très courte, drôle, pour
// tous les âges. Adel (29/09/2026) : « Ah zut, c'est dommage… manque de
// concentration ».
export type MascotMood = 'party' | 'happy' | 'cheer' | 'oops' | 'sleepy';

const SOLO_RESULT_LIBRARY: Record<MascotMood, string[]> = {
  party: [
    'Incroyable ! Zéro faute, ton oreille était en feu !',
    'Parfait du début à la fin. Là, tu maîtrises vraiment !',
    'Tout juste ! Même Loki n’a rien à redire sur cette partie.',
    'Sans faute. Tu viens de mettre la barre très haut !',
    'Quelle partie ! Tu as reconnu absolument tout.',
    'Carton plein ! Ton radar musical n’a rien laissé passer.',
    'Magnifique sans-faute. Tu peux être fier de cette manche.',
    'Tout bon, tout propre. Tu viens de dominer ce Solo.',
    'Parfait ! Cette fois, chaque morceau était pour toi.',
    'Aucune erreur. Ton oreille a fait le travail jusqu’au bout.',
  ],
  happy: [
    'Très solide ! Tu étais vraiment proche du sans-faute.',
    'Belle partie ! Ton oreille a répondu présente presque partout.',
    'Ça devient sérieux : encore un peu et tu fais le carton plein.',
    'Très bon score. Tu reconnais déjà beaucoup de choses très vite.',
    'Bien joué ! Il ne manquait presque rien pour tout prendre.',
    'Belle écoute. Tu as gardé le rythme jusqu’à la fin.',
    'Solide ! La prochaine peut clairement être parfaite.',
    'Tu chauffes ! Ton score montre que tu connais vraiment ta musique.',
    'Très propre. Deux ou trois détails et tu passes au niveau au-dessus.',
    'Bonne partie ! Tu étais dans le bon tempo presque tout le long.',
  ],
  cheer: [
    'Tu avances. La prochaine partie peut déjà faire beaucoup mieux.',
    'Pas mal du tout. Ton oreille commence à prendre les bons repères.',
    'Tu as trouvé de bons morceaux. Continue, ça vient vite.',
    'Il y a de bonnes réponses là-dedans. On affine et on repart.',
    'Tu progresses : garde les bons réflexes de cette partie.',
    'Quelques pièges t’ont eu, mais la base est là.',
    'Tu tiens quelque chose. Une nouvelle partie et on monte le score.',
    'Ça se construit. Écoute les premières secondes encore plus attentivement.',
    'Tu as déjà les bons automatismes sur plusieurs morceaux.',
    'Score honnête. Maintenant, va chercher les points qui manquent.',
  ],
  oops: [
    'Cette partie t’a piégé. On repart et on change complètement le score.',
    'Pas ta meilleure manche, mais elle te montre exactement quoi travailler.',
    'Les morceaux étaient vicieux cette fois. La revanche est ouverte.',
    'Ça arrive ! Fais table rase et repars avec les oreilles fraîches.',
    'Partie compliquée. Une nouvelle série peut tout changer.',
    'Loki a sorti les pièges aujourd’hui. À toi de répondre au prochain tour.',
    'Tu t’es fait surprendre. Maintenant tu sais où être plus attentif.',
    'On oublie ce score et on repart chercher mieux tout de suite.',
    'Pas évident cette fois. Le prochain Solo est une nouvelle histoire.',
    'Cette manche était dure. Ne lui laisse pas le dernier mot.',
  ],
  sleepy: [
    'Hé ho ! Tu es parti ? Je t’attendais, moi !',
    'Silence radio ! Loki a joué les morceaux tout seul.',
    'Personne au casque ? Cette partie s’est jouée sans réponse.',
    'Tu m’as laissé seul avec la playlist ! Reviens pour la prochaine.',
    'On dirait que tu avais autre chose à faire. Aucun souci, on repart après.',
    'Loki a attendu… et attendu. La prochaine, reste avec moi jusqu’au bout.',
  ],
};

function resultLibraryIndex(seed: string, size: number): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % Math.max(1, size);
}

// Une partie = une phrase propre. Le seed de session garde la phrase stable
// pendant les re-renders, tandis que la rotation évite de resservir une
// phrase déjà utilisée tant que toute la bibliothèque de ce mood n'a pas été
// parcourue. À l'épuisement on recommence un cycle sans répéter la dernière.
const RESULT_LINE_CACHE = new Map<string, { mood: MascotMood; text: string }>();
const RESULT_USED_INDEXES: Record<MascotMood, Set<number>> = {
  party: new Set<number>(),
  happy: new Set<number>(),
  cheer: new Set<number>(),
  oops: new Set<number>(),
  sleepy: new Set<number>(),
};
const RESULT_LAST_INDEX: Partial<Record<MascotMood, number>> = {};

export function mascotLine(correct: number, total: number, allTimeouts = false, seed = ''): { mood: MascotMood; text: string } {
  const ratio = total > 0 ? correct / total : 0;
  const mood: MascotMood = allTimeouts || total <= 0
    ? 'sleepy'
    : ratio >= 1
      ? 'party'
      : ratio >= 0.6
        ? 'happy'
        : ratio >= 0.3
          ? 'cheer'
          : 'oops';
  const key = seed || `${correct}:${total}:${mood}`;
  const cached = RESULT_LINE_CACHE.get(key);
  if (cached) return cached;

  const pool = SOLO_RESULT_LIBRARY[mood];
  const used = RESULT_USED_INDEXES[mood];
  if (used.size >= pool.length) {
    const last = RESULT_LAST_INDEX[mood];
    used.clear();
    if (last != null && pool.length > 1) used.add(last);
  }

  let index = resultLibraryIndex(key, pool.length);
  for (let offset = 0; offset < pool.length && used.has(index); offset += 1) {
    index = (index + 1) % pool.length;
  }
  used.add(index);
  RESULT_LAST_INDEX[mood] = index;

  const result = { mood, text: pool[index] };
  RESULT_LINE_CACHE.set(key, result);
  if (RESULT_LINE_CACHE.size > 120) {
    const oldest = RESULT_LINE_CACHE.keys().next().value;
    if (oldest) RESULT_LINE_CACHE.delete(oldest);
  }
  return result;
}

// Adel (02/10/2026) : « ou attends la recharge de 2 h, ça ne veut rien dire ».
// Bouton RECHARGER MES SOLOS : sous le bouton, le contenu exact du pack
// (réglé dans le Super Admin) ; « En savoir plus » explique le débit.
// Valeurs par défaut identiques à la migration (10 Solos · 3 Free, 25 · 6).
export type SoloPackLike = { code: 'SMALL' | 'LARGE'; solos: number; free: number };
export const DEFAULT_SOLO_PACKS: SoloPackLike[] = [
  { code: 'SMALL', solos: 10, free: 3 },
  { code: 'LARGE', solos: 25, free: 6 },
];

export function soloRechargeCopy(packs: SoloPackLike[] | null | undefined, _status: SoloDailyStatusLike | null): { hint: string; short: string; full: string } {
  const list = packs && packs.length ? packs : DEFAULT_SOLO_PACKS;
  const small = list.find((p) => p.code === 'SMALL') ?? list[0];
  const large = list.find((p) => p.code === 'LARGE');
  const freeWord = (n: number) => `${n} Free`;
  const offers = [small, large].filter(Boolean).map((p) => `+${p!.solos} Solos pour ${freeWord(p!.free)}`).join(' · ');
  return {
    hint: offers,
    short: 'Deux packs au choix',
    full: `Packs disponibles : ${offers}. Le pack choisi est crédité immédiatement sur ton stock de Solos. Chaque partie consomme 1 Solo. Les Solos achetés restent sur ton compte jusqu’à utilisation. Aucun pack ne se renouvelle automatiquement : quand ce stock est épuisé, il faut acheter un nouveau pack.`,
  };
}
