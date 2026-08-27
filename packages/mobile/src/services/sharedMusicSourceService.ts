import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@keep/shared-music-source-v1';

export type SharedMusicPlatform = 'TIKTOK' | 'INSTAGRAM' | 'SNAPCHAT' | 'YOUTUBE' | 'FACEBOOK' | 'WEB' | 'UNKNOWN';

export type SharedMusicSource = {
  url: string;
  rawText?: string;
  title?: string;
  platform: SharedMusicPlatform;
  sharedAt: string;
};

let memorySource: SharedMusicSource | null = null;

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
  try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(source)); } catch {}
}

export async function getSharedMusicSource(): Promise<SharedMusicSource | null> {
  if (memorySource) return memorySource;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SharedMusicSource;
    if (!parsed?.url || !parsed?.sharedAt) return null;
    // Une source sociale ne doit jamais contaminer une écoute effectuée plus tard.
    if (Date.now() - new Date(parsed.sharedAt).getTime() > 30 * 60 * 1000) {
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
  try { await AsyncStorage.removeItem(STORAGE_KEY); } catch {}
}
