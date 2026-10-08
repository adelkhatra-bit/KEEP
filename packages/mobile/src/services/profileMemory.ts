import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Mémoire locale du profil (Adel, 05/10/2026 : « le chargement du profil est très long, on pourra avoir toute la page complète avec
 * un système de mémoire »). Principe « stale-while-revalidate » : on affiche TOUT DE SUITE la dernière version connue (mémoire vive,
 * puis disque), puis le serveur la remplace. Jamais une source de vérité : une donnée serveur écrase toujours la mémoire.
 * Même code sur application et ordinateur (AsyncStorage = localStorage sur le web).
 */
const PREFIX = '@keep/profile-memory-v1';
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const memory = new Map<string, unknown>();

const storageKey = (userId: string, key: string) => `${PREFIX}:${userId}:${key}`;

/** Mémoire vive puis disque ; `undefined` si rien ou trop ancien (7 jours). */
export async function readProfileMemory<T>(userId: string, key: string): Promise<T | undefined> {
  if (!userId) return undefined;
  const full = storageKey(userId, key);
  if (memory.has(full)) return memory.get(full) as T;
  try {
    const raw = await AsyncStorage.getItem(full);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { at?: number; value?: T };
    if (!parsed || typeof parsed.at !== 'number' || Date.now() - parsed.at > MAX_AGE_MS) return undefined;
    memory.set(full, parsed.value);
    return parsed.value;
  } catch {
    return undefined;
  }
}

export function writeProfileMemory<T>(userId: string, key: string, value: T): void {
  if (!userId) return;
  const full = storageKey(userId, key);
  memory.set(full, value);
  try {
    void AsyncStorage.setItem(full, JSON.stringify({ at: Date.now(), value })).catch(() => {});
  } catch { /* stockage plein ou indisponible : la mémoire vive suffit */ }
}
