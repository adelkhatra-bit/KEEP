import { supabase } from './supabaseClient';

/** Partage sur ordinateur : durée fixe, puis déconnexion automatique (serveur : keep-web-pairing). */
export const PC_SHARE_DURATION_HOURS = 24;
export const PC_SHARE_COST_KEY = 'web_share_free_cost';

/** Coût en FREE d'un partage de 24 h, piloté par le Super Admin (remote_config). 0 = gratuit (valeur de départ). */
export async function loadPcShareFreeCost(): Promise<number> {
  if (!supabase) return 0;
  try {
    const { data } = await supabase.from('remote_config').select('value').eq('key', PC_SHARE_COST_KEY).maybeSingle();
    const cost = Number(data?.value);
    return Number.isFinite(cost) && cost > 0 ? Math.floor(cost) : 0;
  } catch {
    return 0;
  }
}

/** Texte du popup « Partager sur mon PC » : le tarif est toujours annoncé, même quand il vaut 0. */
export function pcShareMessage(cost: number): string {
  const tariff = cost > 0
    ? `Aujourd’hui : gratuit. Bientôt : ${cost} FREE par partage de ${PC_SHARE_DURATION_HOURS} h.`
    : 'Aujourd’hui : gratuit. Bientôt payant en FREE : le tarif sera annoncé ici avant d’être appliqué.';
  return [
    '1. Sur ton ordinateur, ouvre Loki Music : un QR code s’affiche.',
    '2. Scanne-le avec l’appareil photo de ce téléphone, puis touche « Oui, c’est moi ».',
    `L’accès dure ${PC_SHARE_DURATION_HOURS} h puis l’ordinateur se déconnecte tout seul. Tu peux aussi le déconnecter ici à tout moment.`,
    tariff,
  ].join('\n');
}

/** Heures restantes avant la déconnexion automatique d'un ordinateur (0 si déjà expiré). */
export function pcShareHoursLeft(createdAtIso: string, now = Date.now()): number {
  const at = new Date(createdAtIso).getTime();
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, Math.ceil((at + PC_SHARE_DURATION_HOURS * 3600000 - now) / 3600000));
}
