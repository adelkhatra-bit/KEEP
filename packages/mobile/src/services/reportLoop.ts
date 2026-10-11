// Boucle de réparation par secousse (Adel, 06/10/2026, IDEA-125). Module PUR : fil des dernières actions, filtre d'insultes, phrases du robot.
export type Crumb = { t: number; kind: 'screen' | 'action' | 'error'; label: string };
const MAX_CRUMBS = 25;
const crumbs: Crumb[] = [];
/** Mémorise (en mémoire seulement, jamais envoyé seul) un écran visité, une action ou une erreur : le contexte envoyé lors d'une secousse. */
export function pushCrumb(kind: Crumb['kind'], label: string, now: number = Date.now()): void {
  const clean = String(label ?? '').replace(/[\r\n]+/g, ' ').slice(0, 80);
  if (!clean) return;
  const last = crumbs[crumbs.length - 1];
  if (last && last.kind === kind && last.label === clean) return;
  crumbs.push({ t: now, kind, label: clean });
  if (crumbs.length > MAX_CRUMBS) crumbs.shift();
}
export const readCrumbs = (): Crumb[] => crumbs.slice();
export const clearCrumbs = (): void => { crumbs.length = 0; };

const INSULTS = ['connard', 'connasse', 'salope', 'pute', 'encule', 'enculé', 'fdp', 'ntm', 'nique ta', 'batard', 'bâtard', 'merde', 'va te faire', 'ta gueule', 'fils de pute', 'sale arabe', 'sale noir', 'sale juif', 'fuck', 'bitch', 'asshole', 'cunt'];
const fold = (text: string) => ` ${text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ')} `;
/** Vrai si le message contient une insulte : il n'est alors pas transmis tel quel (l'utilisateur est signalé au Super Admin, qui décide). */
export function isAbusiveReport(text: string): boolean {
  const folded = fold(text);
  return INSULTS.some((word) => folded.includes(` ${fold(word).trim()} `) || (word.includes(' ') && folded.includes(fold(word).trim())));
}

export type ReportUpdate = { id: string; screen: string; status: 'FIXED' | 'NEEDS_UPDATE' | 'NOT_A_BUG'; note?: string | null };
const SCREEN_LABELS: Record<string, string> = { Main: 'l’accueil', Profile: 'ton profil', Discover: 'Découvertes', Offers: 'les offres', MusicConnections: 'tes services musicaux', PlaylistSale: 'les collections', SessionHistory: 'tes sessions' };
export const screenLabel = (screen: string) => SCREEN_LABELS[screen] ?? `l’écran « ${screen} »`;

/** Phrase du robot quand l'IA a traité le signalement (jamais deux fois la même formulation exacte pour un même statut). */
export function composeReportUpdateLine(update: ReportUpdate, seed = 0): string {
  const where = screenLabel(update.screen);
  const pick = (list: string[]) => list[Math.abs(seed) % list.length];
  if (update.status === 'FIXED') return pick([`Ton souci sur ${where} a été localisé et réparé ✅ Tu peux réessayer.`, `C’est réglé : le bug sur ${where} a été nettoyé ✅ Merci de l’avoir signalé !`]);
  if (update.status === 'NEEDS_UPDATE') return pick([`Le bug sur ${where} est réparé ✅ Fais ta mise à jour de l’app pour en profiter.`, `Correction prête pour ${where} ✅ Mets l’app à jour (ou relance-la) pour la recevoir.`]);
  return pick([`J’ai regardé ton signalement sur ${where} : tout fonctionne de notre côté. Réessaie, et secoue de nouveau si ça persiste.`, `Pas de bug détecté sur ${where} pour l’instant. Si ça recommence, secoue ton téléphone et décris-le.`]);
}
