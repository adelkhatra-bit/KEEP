/**
 * Sidecar de métadonnées pour le corpus QA -- voir
 * packages/recognition-engine/generate_qa_corpus.py (pistes 100%
 * composées ici, aucun souci de droits) et
 * packages/backend/data/keep-local-index/qa-corpus-metadata.json.
 *
 * TEMPORAIRE : ne remplace PAS keep_fingerprints/tracks (Supabase, voir
 * keepLocalIndexStore.ts) -- c'est le mécanisme réel et persistant pour de
 * VRAIS morceaux découverts par de VRAIS utilisateurs. Ce fichier sert
 * UNIQUEMENT à résoudre le corpus QA tant que la migration
 * 0009_keep_local_index.sql n'est pas encore appliquée côté Supabase (une
 * action humaine, voir routes/recognition.ts) -- permet de prouver la
 * chaîne micro -> audfprint -> titre/artiste dès maintenant, sans attendre.
 * À supprimer une fois le corpus QA basculé dans Supabase si on veut le
 * garder au-delà des tests (pas fait ici -- hors périmètre du diagnostic du 23/08/2026).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

interface QaTrackMeta {
  title: string;
  artist: string;
}

let cache: Record<string, QaTrackMeta> | null = null;

async function load(): Promise<Record<string, QaTrackMeta>> {
  if (cache) return cache;
  const dir = process.env.KEEP_LOCAL_INDEX_DIR ?? path.join(process.cwd(), 'data', 'keep-local-index');
  const file = path.join(dir, 'qa-corpus-metadata.json');
  try {
    cache = JSON.parse(await readFile(file, 'utf-8'));
  } catch {
    cache = {};
  }
  return cache!;
}

export async function resolveQaCorpusTrack(audfprintKey: string): Promise<QaTrackMeta | null> {
  const meta = await load();
  return meta[audfprintKey] ?? null;
}
