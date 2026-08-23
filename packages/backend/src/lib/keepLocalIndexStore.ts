/**
 * Couche persistance (Supabase) du KEEP Local Index -- voir
 * localFingerprintIndex.ts pour la couche empreintes (audfprint/.pklz).
 * Ce fichier ne gère QUE les métadonnées (`tracks`, `keep_fingerprints`,
 * migration 0009_keep_local_index.sql).
 *
 * Utilise TOUJOURS le jeton de l'utilisateur courant (jamais service_role)
 * -- cf. keepAuth.ts : "réutilisé pour parler à PostgREST AVEC les droits
 * de l'utilisateur (respecte RLS)". Les policies 0009 autorisent déjà
 * l'écriture à toute session authentifiée, y compris invité -- voir
 * migration pour le raisonnement (donnée de référence publique, pas privée).
 */
import { supabaseUserClient, isSupabaseUserClientConfigured } from './supabaseUserClient';

export interface IndexTrack {
  id: string;
  isrc?: string;
  title: string;
  artist: string;
  album?: string;
  durationSec?: number;
  artworkUrl?: string;
  providerIds: Record<string, string | undefined>;
}

export const isKeepLocalIndexConfigured = isSupabaseUserClientConfigured;
const clientFor = supabaseUserClient;

interface TracksRow {
  id: string;
  isrc: string | null;
  title: string;
  artist: string;
  album: string | null;
  duration_sec: number | null;
  artwork_url: string | null;
  provider_ids: Record<string, string | undefined>;
}

function fromRow(row: TracksRow): IndexTrack {
  return {
    id: row.id,
    isrc: row.isrc ?? undefined,
    title: row.title,
    artist: row.artist,
    album: row.album ?? undefined,
    durationSec: row.duration_sec ?? undefined,
    artworkUrl: row.artwork_url ?? undefined,
    providerIds: row.provider_ids ?? {},
  };
}

/** Résout une clé audfprint (voir localFingerprintIndex.matchLocal) vers un vrai morceau KEEP. `null` = clé orpheline (ne devrait pas arriver -- écrite en même temps que le fingerprint, voir recordConfirmedTrack). */
export async function resolveByFingerprintKey(accessToken: string, audfprintKey: string): Promise<IndexTrack | null> {
  const client = clientFor(accessToken);
  const { data: fp, error: fpError } = await client
    .from('keep_fingerprints')
    .select('track_id')
    .eq('audfprint_key', audfprintKey)
    .maybeSingle();
  if (fpError || !fp) return null;

  const { data: track, error: trackError } = await client.from('tracks').select('*').eq('id', fp.track_id).maybeSingle();
  if (trackError || !track) return null;
  return fromRow(track as TracksRow);
}

/**
 * Trouve un `tracks` existant (par ISRC, sinon titre+artiste) ou en crée un
 * nouveau -- ne duplique jamais un morceau déjà connu (même règle anti-doublon
 * que TrackResolver côté client, voir packages/music/src/TrackResolver.ts).
 */
export async function findOrCreateTrack(
  accessToken: string,
  track: { title: string; artist: string; album?: string; durationSec?: number; artworkUrl?: string; isrc?: string }
): Promise<IndexTrack> {
  const client = clientFor(accessToken);

  if (track.isrc) {
    const { data } = await client.from('tracks').select('*').eq('isrc', track.isrc).maybeSingle();
    if (data) return fromRow(data as TracksRow);
  } else {
    const { data } = await client
      .from('tracks')
      .select('*')
      .ilike('title', track.title)
      .ilike('artist', track.artist)
      .maybeSingle();
    if (data) return fromRow(data as TracksRow);
  }

  const { data: created, error } = await client
    .from('tracks')
    .insert({
      isrc: track.isrc ?? null,
      title: track.title,
      artist: track.artist,
      album: track.album ?? null,
      duration_sec: track.durationSec ?? null,
      artwork_url: track.artworkUrl ?? null,
      provider_ids: {},
    })
    .select('*')
    .single();
  if (error || !created) throw new Error(`keep_local_index: échec création tracks (${error?.message ?? 'réponse vide'})`);
  return fromRow(created as TracksRow);
}

/** Enregistre la correspondance clé audfprint -> morceau -- la prochaine reconnaissance du même son passe par matchLocal(), gratuite. Doublon (même clé déjà enregistrée) ignoré silencieusement -- ne doit jamais faire échouer la reconnaissance en cours. */
export async function recordFingerprintKey(
  accessToken: string,
  trackId: string,
  audfprintKey: string,
  sourceProvider: string,
  confidence?: number
): Promise<void> {
  const client = clientFor(accessToken);
  const { error } = await client
    .from('keep_fingerprints')
    .insert({ track_id: trackId, audfprint_key: audfprintKey, source_provider: sourceProvider, confidence: confidence ?? null });
  if (error && error.code !== '23505') {
    // 23505 = violation unique (clé déjà enregistrée par une requête concurrente) -- pas une vraie erreur ici.
    throw new Error(`keep_local_index: échec enregistrement fingerprint (${error.message})`);
  }
}
