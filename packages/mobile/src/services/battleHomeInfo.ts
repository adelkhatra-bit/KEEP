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

export type SoloDailyStatusLike = { limit: number | null; remaining: number | null; unlimited: boolean; resetsAt?: string | null; plan?: string };

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
  if (status.unlimited) return { headline: 'Solos : illimités', detail: 'inclus dans ta formule', exhausted: false };
  const limit = Math.max(0, status.limit ?? 0);
  const remaining = Math.max(0, status.remaining ?? 0);
  const reset = `recharge à ${hhmm(status.resetsAt)}`;
  if (remaining <= 0) return { headline: `Solos : 0 / ${limit} restant`, detail: reset, exhausted: true };
  return { headline: `Solos : ${remaining} / ${limit} restant${remaining > 1 ? 's' : ''}`, detail: reset, exhausted: false };
}

// Règle par profil, affichée sous la recharge : combien de Solos par jour.
// Adel (29/09/2026) : plus d'illimité en Solo, chaque formule a sa limite
// (réglable dans Super Admin) ; chaque départ compte, même abandonné.
const PLAN_LABELS: Record<string, string> = { FREE: 'formule gratuite', PREMIUM: 'Premium', CREATOR_PRO: 'Créateur Pro', VENUE_PRO: 'Lieu Pro' };
export function soloPlanRuleCopy(status: SoloDailyStatusLike | null): { short: string; full: string } | null {
  if (!status) return null;
  const plan = PLAN_LABELS[String(status.plan || 'FREE').toUpperCase()] ?? 'ta formule';
  if (status.unlimited) return { short: 'Solos illimités avec ta formule', full: 'Ta formule te donne des parties Solo illimitées.' };
  const limit = Math.max(0, status.limit ?? 0);
  return { short: `${limit} Solos par jour · ${plan}`, full: `Formule ${plan} : ${limit} parties Solo par jour, remises à zéro chaque nuit. Chaque partie lancée compte, même si tu la quittes avant la fin. Le Battle en ligne n'est pas concerné : il se joue avec tes Free.` };
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
// Le serveur compte la partie au DÉMARRAGE (keep_battle_solo_consume_daily_start) :
// quitter en route ne la rend pas. `status` = statut lu avant le départ.
export function soloCostNotice(status: SoloDailyStatusLike | null): string | null {
  if (!status || status.unlimited) return null;
  const limit = Math.max(0, status.limit ?? 0);
  const after = Math.max(0, (status.remaining ?? 0) - 1);
  return `Cette partie utilise 1 Solo du jour : il t'en restera ${after} sur ${limit}. Même si tu quittes avant la fin, elle reste comptée.`;
}

// `status` = statut lu AVANT le départ (le compteur de l'accueil) : la partie
// en cours est déjà décomptée côté serveur.
export function soloQuitNotice(status: SoloDailyStatusLike | null): string {
  if (!status || status.unlimited) return 'Ta partie en cours sera perdue (aucun Free gagné).';
  const limit = Math.max(0, status.limit ?? 0);
  const left = Math.max(0, (status.remaining ?? 0) - 1);
  return `Cette partie Solo est déjà comptée et ne sera pas rendue. Il te restera ${left} Solo${left > 1 ? 's' : ''} sur ${limit} aujourd'hui, et tu ne gagnes aucun Free sur cette partie.`;
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
