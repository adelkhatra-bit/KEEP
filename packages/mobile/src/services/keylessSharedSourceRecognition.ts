import type { RecognitionResult } from '@keep/music';
import { getSharedMusicSource } from './sharedMusicSourceService';
import { supabase } from './supabaseClient';

const POSITIVE_CACHE_MS = 5 * 60 * 1000;
const NEGATIVE_RETRY_MS = 30 * 1000;

type CacheState = {
  key: string;
  attemptedAt: number;
  recognition: RecognitionResult | null;
};

let cache: CacheState | null = null;

function sourceKey(source: { url: string; sharedAt: string }) {
  return `${source.url}|${source.sharedAt}`;
}

function validRecognition(value: any): value is RecognitionResult {
  return Boolean(value && typeof value.title === 'string' && value.title.trim() && typeof value.artist === 'string' && value.artist.trim());
}

/**
 * Résout un lien musical/social tout juste partagé vers Loki sans credential
 * fournisseur. La fonction Edge utilise uniquement les métadonnées publiques
 * du lien puis recoupe Apple iTunes Search + Deezer public.
 *
 * Ce chemin ne remplace pas une empreinte audio : il complète ShazamKit/AudD/
 * ACRCloud lorsque l'utilisateur partage TikTok, YouTube, Instagram, Snapchat,
 * Facebook ou un lien de service musical.
 */
export async function recognizeSharedSourceKeyless(): Promise<RecognitionResult | null> {
  if (!supabase) return null;

  const source = await getSharedMusicSource();
  if (!source?.url) return null;

  const key = sourceKey(source);
  const now = Date.now();
  if (cache?.key === key) {
    if (cache.recognition && now - cache.attemptedAt < POSITIVE_CACHE_MS) return cache.recognition;
    if (!cache.recognition && now - cache.attemptedAt < NEGATIVE_RETRY_MS) return null;
  }

  cache = { key, attemptedAt: now, recognition: null };
  try {
    const { data, error } = await supabase.functions.invoke('keep-music-keyless-source', {
      body: {
        url: source.url,
        rawText: source.rawText ?? null,
        title: source.title ?? null,
        platform: source.platform,
      },
    });
    if (error || !data?.ok || !validRecognition(data?.recognition)) return null;

    const recognition = data.recognition as RecognitionResult;
    cache = { key, attemptedAt: Date.now(), recognition };
    return recognition;
  } catch {
    // Le fallback gratuit ne doit jamais interrompre l'écoute. Une panne ou un
    // site social qui bloque ses métadonnées laisse simplement la cascade
    // continuer vers l'empreinte audio suivante.
    return null;
  }
}

export function resetKeylessSharedSourceRecognitionCache() {
  cache = null;
}
