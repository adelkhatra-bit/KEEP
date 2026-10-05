import AsyncStorage from '@react-native-async-storage/async-storage';
import { composeTickerBatch, hashMessage } from './tickerMessageLibrary';

// Mémoire des derniers messages de bandelette affichés (Adel, 05/10/2026) : jamais les mêmes à chaque connexion ni à chaque passage.
const KEY = 'keep:ticker:recent:v1';
const MAX_REMEMBERED = 400;

export async function nextTickerBatch(count: number, channel: string): Promise<string[]> {
  let recent: string[] = [];
  try { const raw = await AsyncStorage.getItem(`${KEY}:${channel}`); recent = raw ? JSON.parse(raw) : []; } catch { recent = []; }
  const seed = `${channel}:${Date.now()}:${Math.floor(Math.random() * 1e9)}`;
  const batch = composeTickerBatch(count, seed, new Set(recent));
  try { await AsyncStorage.setItem(`${KEY}:${channel}`, JSON.stringify([...batch.map(hashMessage), ...recent].slice(0, MAX_REMEMBERED))); } catch { /* sans mémoire : tirage aléatoire quand même */ }
  return batch;
}
