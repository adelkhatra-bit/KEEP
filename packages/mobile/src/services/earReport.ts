// « Mon oreille » (Adel, 05/10/2026, IDEA-113) : le monde parallèle des connaisseurs. Module PUR (aucun réseau) : niveaux, défis, rapport de communauté.
// Données : RPC keep_my_ear_report (lecture seule). Flair = repérer tôt (≤ 3e) une musique que beaucoup finissent par aimer.
export type EarGenre = { genre: string; tracks: number; likes: number; mehs: number; dislikes: number };
export type EarRaw = {
  given: number; early_hits: number; early_keeps: number; received: number; followers: number; followers_30: number; styles_explored: number;
  genres: EarGenre[]; pioneer_styles: { genre: string; rank: number }[]; audience: { genre: string; fans: number }[];
};

export const EAR_LEVELS = [
  { min: 0, label: 'Oreille curieuse', icon: '👂' },
  { min: 10, label: 'Oreille fine', icon: '🎧' },
  { min: 30, label: 'Oreille experte', icon: '🔥' },
  { min: 80, label: 'Oreille d’or', icon: '🥇' },
  { min: 200, label: 'Oreille légendaire', icon: '👑' },
] as const;

/** Points de flair : repérer tôt compte beaucoup plus que réagir. */
export function earPoints(r: EarRaw): number {
  return r.given + 5 * r.early_hits + 3 * r.early_keeps + 10 * r.pioneer_styles.length;
}

export function earLevel(points: number) {
  let idx = 0;
  EAR_LEVELS.forEach((l, i) => { if (points >= l.min) idx = i; });
  const cur = EAR_LEVELS[idx];
  const next = EAR_LEVELS[idx + 1] ?? null;
  return { ...cur, next, toNext: next ? next.min - points : 0, progress: next ? Math.min(1, (points - cur.min) / (next.min - cur.min)) : 1 };
}

export type EarChallenge = { key: string; label: string; value: number; goal: number; done: boolean };
/** Défis personnalisés construits depuis les statistiques de la personne : on propose toujours le plus proche à atteindre. */
export function earChallenges(r: EarRaw): EarChallenge[] {
  const mk = (key: string, label: string, value: number, goal: number): EarChallenge => ({ key, label, value, goal, done: value >= goal });
  return [
    mk('given', 'Réagir à 20 musiques', r.given, 20),
    mk('early', 'Repérer 3 tubes avant tout le monde', r.early_hits + r.early_keeps, 3),
    mk('styles', 'Explorer 5 styles différents', r.styles_explored, 5),
    mk('received', 'Recevoir 10 ❤ sur tes partages', r.received, 10),
    mk('followers', 'Gagner 5 abonnés en 30 jours', r.followers_30, 5),
    mk('pioneer', 'Être parmi les 3 premiers sur un style', r.pioneer_styles.length, 1),
  ].sort((a, b) => Number(a.done) - Number(b.done) || (b.value / b.goal) - (a.value / a.goal));
}

const cap = (g: string) => g.charAt(0).toUpperCase() + g.slice(1);
export const approval = (g: EarGenre) => { const t = g.likes + g.mehs + g.dislikes; return t ? g.likes / t : null; };

export type EarReport = { strengths: string[]; weaknesses: string[]; opportunities: string[] };
/** Rapport global de la communauté : points forts, points faibles, opportunités — chaque phrase vient d'un chiffre réel. */
export function communityReport(r: EarRaw): EarReport {
  const strengths: string[] = [], weaknesses: string[] = [], opportunities: string[] = [];
  const rated = r.genres.filter((g) => g.likes + g.mehs + g.dislikes >= 2);
  const best = [...rated].sort((a, b) => (approval(b)! - approval(a)!) || b.likes - a.likes)[0];
  if (best && best.likes > 0) strengths.push(`${cap(best.genre)} : ${Math.round(approval(best)! * 100)} % d’approbation (${best.likes} ❤ sur ${best.likes + best.mehs + best.dislikes} avis).`);
  r.pioneer_styles.slice(0, 2).forEach((p) => strengths.push(`Tu as été n°${p.rank} à adopter ${cap(p.genre)} : tu repères les styles avant les autres.`));
  if (r.early_hits + r.early_keeps > 0) strengths.push(`${r.early_hits + r.early_keeps} musique${r.early_hits + r.early_keeps > 1 ? 's' : ''} repérée${r.early_hits + r.early_keeps > 1 ? 's' : ''} avant la foule.`);
  const worst = [...rated].sort((a, b) => (approval(a)! - approval(b)!) || b.dislikes - a.dislikes)[0];
  if (worst && worst !== best && approval(worst)! < 0.5) weaknesses.push(`${cap(worst.genre)} : seulement ${Math.round(approval(worst)! * 100)} % d’approbation (${worst.dislikes} 👎, ${worst.mehs} 😐). Change d’angle ou de morceaux.`);
  if (!r.genres.length) weaknesses.push('Aucun partage noté pour l’instant : partage des musiques en story pour mesurer ton style.');
  else if (!rated.length) weaknesses.push('Tes partages n’ont pas encore reçu d’avis : relance ta story pour mesurer ce qui plaît.');
  if (r.followers > 0 && r.followers_30 === 0) weaknesses.push('Aucun nouvel abonné ces 30 derniers jours : ta communauté ne grandit plus.');
  const mine = new Set(r.genres.map((g) => g.genre));
  const gap = r.audience.find((a) => !mine.has(a.genre));
  if (gap) opportunities.push(`${gap.fans} de tes abonnés aiment ${cap(gap.genre)} et tu n’en partages pas : c’est ton prochain style.`);
  else if (r.audience[0]) opportunities.push(`Ta communauté adore ${cap(r.audience[0].genre)} (${r.audience[0].fans} fans) : double la mise sur ce style.`);
  if (r.followers_30 > 0) opportunities.push(`+${r.followers_30} abonné${r.followers_30 > 1 ? 's' : ''} en 30 jours : c’est le moment de partager plus souvent.`);
  if (!opportunities.length) opportunities.push('Invite des amis : ta communauté est encore petite, chaque abonné rend le rapport plus précis.');
  return { strengths, weaknesses, opportunities };
}
