/** Les musiques EN VENTE d'une story portent l'identifiant « sale:<id> » : le j'aime enregistre toujours l'id réel (module pur, sans dépendance). */
export const SALE_PREFIX = 'sale:';
export const likeKey = (trackId: string): string => (trackId.startsWith(SALE_PREFIX) ? trackId.slice(SALE_PREFIX.length) : trackId);
