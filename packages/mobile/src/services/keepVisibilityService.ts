import type { CanonicalTrack } from '@keep/music';
import type { KeepVisibility } from '../types';
import {
  loadOwnPersistedKeeps,
  recordKeepDecision,
  updateKeepDecisionVisibility,
  type PersistedKeepDecision,
} from './keepMusicCoreRecognition';
import { musicEngine } from './musicEngine';
import { supabase } from './supabaseClient';
import { APP_NAME } from '../config/brand';

function normalize(value: string | undefined): string {
  return (value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sameCanonicalTrack(a: CanonicalTrack, b: CanonicalTrack): boolean {
  const aId = String(a.id || '').trim();
  const bId = String(b.id || '').trim();
  if (aId && bId && aId === bId) return true;

  const aIsrc = String(a.isrc || '').trim().toUpperCase();
  const bIsrc = String(b.isrc || '').trim().toUpperCase();
  if (aIsrc && bIsrc) return aIsrc === bIsrc;

  return normalize(a.title) === normalize(b.title)
    && normalize(a.artist) === normalize(b.artist);
}

function sameTrack(track: CanonicalTrack, keep: PersistedKeepDecision): boolean {
  const localId = String(track.id || '').trim();
  const remoteId = String(keep.track.id || '').trim();
  if (localId && remoteId && localId === remoteId) return true;

  const localIsrc = String(track.isrc || '').trim().toUpperCase();
  const remoteIsrc = String(keep.track.isrc || '').trim().toUpperCase();
  if (localIsrc && remoteIsrc) return localIsrc === remoteIsrc;

  // Deux UUID différents désignent deux pistes canoniques différentes. En
  // revanche un ID fournisseur local (Spotify/Apple/etc.) peut légitimement
  // différer de l'UUID Supabase : dans ce cas titre + artiste servent de repli.
  if (localId && remoteId && isUuid(localId) && isUuid(remoteId)) return false;

  return normalize(track.title) === normalize(keep.track.title)
    && normalize(track.artist) === normalize(keep.track.artist);
}

function newestFirst(a: PersistedKeepDecision, b: PersistedKeepDecision): number {
  const byDate = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  if (byDate !== 0) return byDate;
  return b.decisionId.localeCompare(a.decisionId);
}

function matchingKeeps(track: CanonicalTrack, keeps: PersistedKeepDecision[]): PersistedKeepDecision[] {
  return keeps.filter((keep) => sameTrack(track, keep)).sort(newestFirst);
}

/**
 * Le fournisseur `demo` est la bibliothèque locale Loki utilisée par la PWA et
 * par les tests quand aucun service externe n'est connecté. Supprimer seulement
 * la décision Supabase laissait auparavant la même piste dans `Mes KEEP` : la
 * ligne disparaissait du profil, mais l'extrait restait visible dans la playlist.
 *
 * On purge donc TOUTES les copies de cette piste dans la bibliothèque locale
 * Loki. Les bibliothèques Apple Music / Spotify ne sont volontairement jamais
 * modifiées ici : une suppression Loki ne doit pas effacer la musique chez un
 * service tiers sans action explicite de l'utilisateur.
 */
async function purgeKeepLocalPlaylistCopies(track: CanonicalTrack): Promise<void> {
  if (musicEngine.musicProvider.providerId !== 'demo') return;

  const session = await musicEngine.getSession();
  const playlists = await musicEngine.musicProvider.getPlaylists(session);

  for (const playlist of playlists) {
    const playlistTracks = await musicEngine.musicProvider.getPlaylistTracks(session, playlist.id);
    const matches = playlistTracks.filter((candidate) => sameCanonicalTrack(candidate, track));
    for (const candidate of matches) {
      await musicEngine.musicProvider.removeTrackFromPlaylist(session, playlist.id, candidate.id);
    }
  }
}

/**
 * Source de vérité du bouton Public / Privé dans « Mes musiques ».
 *
 * Une piste peut posséder plusieurs anciennes décisions Loki (anciens clients,
 * import invité, resynchronisation). Le profil public retient la décision la
 * plus récente. L'ancien code utilisait `find()` sur une liste triée de la plus
 * ancienne à la plus récente : il pouvait donc passer une vieille décision en
 * PRIVÉ, vérifier cette vieille ligne avec succès, puis laisser la décision la
 * plus récente en PUBLIC. Résultat visible : le bouton disait PRIVÉ mais le
 * morceau restait affiché sur le profil.
 *
 * Désormais toutes les décisions historiques qui représentent exactement la
 * même piste sont alignées sur la visibilité demandée, puis Supabase est relu.
 * Aucun succès local n'est affiché tant que la source distante n'a pas confirmé
 * qu'il ne reste plus de décision contradictoire pour ce morceau.
 */
export async function persistOwnTrackVisibility(
  track: CanonicalTrack,
  visibility: KeepVisibility,
): Promise<{ decisionId: string; visibility: KeepVisibility }> {
  if (!supabase) throw new Error(`${APP_NAME} n’est pas connecté au serveur.`);
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.user?.id) throw new Error(`Connecte ton compte ${APP_NAME} pour modifier la visibilité.`);

  let keeps = await loadOwnPersistedKeeps();
  let matches = matchingKeeps(track, keeps);

  if (matches.length === 0) {
    const created = await recordKeepDecision(track, visibility, {
      source: 'visibility_repair',
      repairedAt: new Date().toISOString(),
    });
    if (!created?.decisionId) throw new Error('Impossible de synchroniser ce morceau avec ton profil.');
  } else {
    for (const match of matches) {
      if (match.visibility === visibility) continue;
      const updated = await updateKeepDecisionVisibility(match.decisionId, visibility);
      if (!updated) throw new Error('La visibilité n’a pas été enregistrée dans Supabase.');
    }
  }

  keeps = await loadOwnPersistedKeeps();
  matches = matchingKeeps(track, keeps);
  const newest = matches[0];

  if (!newest || newest.visibility !== visibility || matches.some((keep) => keep.visibility !== visibility)) {
    throw new Error('La vérification serveur de la visibilité a échoué. Réessaie.');
  }

  return { decisionId: newest.decisionId, visibility: newest.visibility };
}

/**
 * Retire définitivement une piste de la bibliothèque Loki du compte actif.
 * Toutes les décisions historiques de cette piste sont supprimées côté serveur
 * afin qu'une ancienne décision PUBLIC ne puisse jamais la faire réapparaître
 * sur le profil après un rechargement.
 *
 * Les Vibes automatiques renvoient l'ID canonique Supabase de la piste. On
 * l'utilise donc directement en plus de la recherche historique locale : la
 * suppression reste fonctionnelle après redémarrage de l'app, même si la
 * session locale n'a plus l'entrée qui avait créé le morceau gardé.
 */
export async function removeOwnTrackFromKeep(track: CanonicalTrack): Promise<number> {
  if (!supabase) throw new Error(`${APP_NAME} n’est pas connecté au serveur.`);
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.user?.id) throw new Error(`Connecte ton compte ${APP_NAME} pour supprimer ce morceau.`);

  const keeps = await loadOwnPersistedKeeps();
  const matches = matchingKeeps(track, keeps);
  const trackIds = new Set(matches.map((keep) => String(keep.track.id || '').trim()).filter(Boolean));
  const canonicalId = String(track.id || '').trim();
  if (isUuid(canonicalId)) trackIds.add(canonicalId);

  if (!trackIds.size) {
    // Une ancienne version peut n'avoir gardé que la copie locale fournisseur.
    // Même sans décision distante retrouvée, SUPPRIMER doit retirer l'extrait.
    await purgeKeepLocalPlaylistCopies(track);
    return 0;
  }

  let removed = 0;
  for (const trackId of trackIds) {
    const { data, error } = await supabase.rpc('keep_remove_track', { p_track_id: trackId });
    if (error) throw new Error('La suppression n’a pas été enregistrée dans Supabase.');
    removed += Number(data || 0);
  }

  // La suppression n'est considérée terminée qu'après avoir retiré aussi la
  // copie qui alimentait l'extrait dans la playlist locale Loki.
  await purgeKeepLocalPlaylistCopies(track);

  const remaining = matchingKeeps(track, await loadOwnPersistedKeeps());
  if (remaining.length) throw new Error('La vérification serveur de la suppression a échoué. Réessaie.');
  return removed;
}
