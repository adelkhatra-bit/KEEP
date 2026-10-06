// Visiteur arrivé par un lien partagé, sans compte (Adel, 06/10/2026, IDEA-127) : le petit robot l'invite, avec le nom de la personne qui l'a invité.
// Module pur : phrases variées, à la française, jamais bloquantes ; le nom change à chaque profil, la formulation aussi.
const hash = (text: string) => { let h = 2166136261; for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

const LINES = [
  (n: string) => `@${n} t’a invité sur Loki Music. Connecte-toi, abonne-toi à lui et raconte-nous ta communauté musicale : je range ta musique dans tes plateformes.`,
  (n: string) => `Tu es chez @${n} ! Crée ton compte en 30 secondes : tu pourras le suivre, écouter plus loin et je classe tes musiques dans tes plateformes préférées.`,
  (n: string) => `Ça te plaît chez @${n} ? Inscris-toi : tu débloques le swipe complet, ton propre profil, et je m’occupe de trier ta musique par plateforme.`,
  (n: string) => `@${n} partage sa musique avec toi. Rejoins-le : abonne-toi, dis-nous ce que tu écoutes et je mets de l’ordre dans tes playlists.`,
];

export function composeVisitorInvite(username: string, seed = 0): string {
  const name = String(username ?? '').trim().replace(/^@+/, '') || 'un ami';
  return LINES[hash(`${name}:${seed}`) % LINES.length](name);
}
export const visitorInviteVariantCount = LINES.length;
