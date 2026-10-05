/** Les musiques EN VENTE d'une story portent l'identifiant « sale:<id> » : le j'aime enregistre toujours l'id réel (module pur, sans dépendance). */
export const SALE_PREFIX = 'sale:';
export const likeKey = (trackId: string): string => (trackId.startsWith(SALE_PREFIX) ? trackId.slice(SALE_PREFIX.length) : trackId);

/** Les réactions s'enregistrent sur les musiques du catalogue Loki (identifiant UUID) ; les identifiants externes (reconnaissance, fournisseurs) ne sont pas stockables. */
export const isUuidKey = (value: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
