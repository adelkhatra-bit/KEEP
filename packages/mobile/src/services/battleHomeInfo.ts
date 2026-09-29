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

// Texte du quota Solo, compréhensible sans connaître le jeu :
// « 2 solos sur 3 aujourd'hui · formule gratuite » + quand ça se recharge.
export function soloQuotaCopy(status: SoloDailyStatusLike | null): { headline: string; detail: string; exhausted: boolean } | null {
  if (!status) return null;
  if (status.unlimited) return { headline: 'Solos illimités', detail: 'Inclus dans ta formule', exhausted: false };
  const limit = Math.max(0, status.limit ?? 0);
  const remaining = Math.max(0, status.remaining ?? 0);
  const reset = `Recharge à ${hhmm(status.resetsAt)}`;
  if (remaining <= 0) return { headline: `0 solo restant sur ${limit} aujourd'hui`, detail: `${reset} · plus avec une formule`, exhausted: true };
  return { headline: `${remaining} solo${remaining > 1 ? 's' : ''} restant${remaining > 1 ? 's' : ''} sur ${limit} aujourd'hui`, detail: `Formule gratuite · ${reset}`, exhausted: false };
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
