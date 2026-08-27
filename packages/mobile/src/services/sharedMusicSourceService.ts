import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@keep/shared-music-source-v1';
const SOURCE_TTL_MS = 5 * 60 * 1000;

export type SharedMusicPlatform = 'TIKTOK' | 'INSTAGRAM' | 'SNAPCHAT' | 'YOUTUBE' | 'FACEBOOK' | 'WEB' | 'UNKNOWN';

export type SharedMusicSource = {
  url: string;
  rawText?: string;
  title?: string;
  platform: SharedMusicPlatform;
  sharedAt: string;
};

let memorySource: SharedMusicSource | null = null;
let storageQueue: Promise<void> = Promise.resolve();

function enqueueStorage(operation: () => Promise<void>) {
  storageQueue = storageQueue.then(operation, operation).catch(() => {});
  return storageQueue;
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/https?:\/\/[^\s]+/i);
  return (match?.[0] ?? trimmed).replace(/[),.;]+$/, '');
}

export function detectSharedMusicPlatform(value: string): SharedMusicPlatform {
  const input = value.toLowerCase();
  if (input.includes('tiktok.com') || input.includes('vm.tiktok.com') || input.includes('vt.tiktok.com')) return 'TIKTOK';
  if (input.includes('instagram.com')) return 'INSTAGRAM';
  if (input.includes('snapchat.com') || input.includes('snap.com')) return 'SNAPCHAT';
  if (input.includes('youtube.com') || input.includes('youtu.be')) return 'YOUTUBE';
  if (input.includes('facebook.com') || input.includes('fb.watch')) return 'FACEBOOK';
  if (/^https?:\/\//i.test(input)) return 'WEB';
  return 'UNKNOWN';
}

export function buildSharedMusicSource(input: { webUrl?: string | null; text?: string | null; title?: string | null }): SharedMusicSource | null {
  const rawText = String(input.text ?? '').trim();
  const url = normalizeUrl(String(input.webUrl ?? rawText));
  if (!url) return null;
  return {
    url,
    rawText: rawText || undefined,
    title: String(input.title ?? '').trim() || undefined,
    platform: detectSharedMusicPlatform(url),
    sharedAt: new Date().toISOString(),
  };
}

export async function setSharedMusicSource(source: SharedMusicSource): Promise<void> {
  memorySource = source;
  await enqueueStorage(async () => {
    // Si un clear plus récent a eu lieu entre-temps, ne réécrit jamais une
    // ancienne provenance sociale dans le stockage persistant.
    if (memorySource !== source) return;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(source));
  });
}

export async function getSharedMusicSource(): Promise<SharedMusicSource | null> {
  if (memorySource) {
    if (Date.now() - new Date(memorySource.sharedAt).getTime() <= SOURCE_TTL_MS) return memorySource;
    await clearSharedMusicSource();
    return null;
  }
  try {
    await storageQueue;
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SharedMusicSource;
    if (!parsed?.url || !parsed?.sharedAt) return null;
    // Une URL sociale n'est valable que pour le handoff tout juste reçu.
    if (Date.now() - new Date(parsed.sharedAt).getTime() > SOURCE_TTL_MS) {
      await clearSharedMusicSource();
      return null;
    }
    memorySource = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearSharedMusicSource(): Promise<void> {
  memorySource = null;
  await enqueueStorage(async () => {
    // Un nouveau partage arrivé après ce clear gagne toujours la course.
    if (memorySource !== null) return;
    await AsyncStorage.removeItem(STORAGE_KEY);
  });
}
