// Visiteur arrivé par un lien partagé, sans compte (Adel, 06/10/2026, IDEA-127) : le petit robot l'invite, avec le nom de la personne qui l'a invité.
// Module pur : phrases variées, à la française, jamais bloquantes ; le nom change à chaque profil, la formulation aussi.
const hash = (text: string) => { let h = 2166136261; for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// Adel (06/10/2026) : « pas la peine de mettre le texte, utilise le bot qui envoie un petit message rapide ». Phrases courtes.
const LINES = [
  (n: string) => `${n} t’invite 🎵`,
  (n: string) => `Bienvenue chez ${n} 👋`,
  (n: string) => `${n} partage sa musique 🎶`,
  (n: string) => `Rejoins ${n} ⚡`,
];

export function composeVisitorInvite(username: string, seed = 0): string {
  const name = displayUsername(username) || 'un ami';
  return LINES[hash(`${name}:${seed}`) % LINES.length](name);
}
export const visitorInviteVariantCount = LINES.length;
import { displayUsername } from '../utils/displayUsername';
