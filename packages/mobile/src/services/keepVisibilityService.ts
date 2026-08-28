import type { CanonicalTrack } from '@keep/music';
import type { KeepVisibility } from '../types';
import {
  loadOwnPersistedKeeps,
  recordKeepDecision,
  updateKeepDecisionVisibility,
  type PersistedKeepDecision,
} from './keepMusicCoreRecognition';
import { supabase } from './supabaseClient';

function normalize(value: string | undefined): string {
  return (value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sameTrack(track: CanonicalTrack, keep: PersistedKeepDecision): boolean {
  const localId = String(track.id || '').trim();
  const remoteId = String(keep.track.id || '').trim();
  // Quand les deux côtés possèdent un identifiant canonique, il est prioritaire.
  // On ne retombe jamais sur titre/artiste si les IDs sont différents : cela
  // évite de modifier par erreur deux versions homonymes d'un morceau.
  if (localId && remoteId) return localId === remoteId;

  const localIsrc = String(track.isrc || '').trim().toUpperCase();
  const remoteIsrc = String(keep.track.isrc || '').trim().toUpperCase();
  if (localIsrc && remoteIsrc) return localIsrc === remoteIsrc;

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
 * Source de vérité du bouton Public / Privé dans « Mes musiques ».
 *
 * Une piste peut posséder plusieurs anciennes décisions KEEP (anciens clients,
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
  if (!supabase) throw new Error('KEEP n’est pas connecté au serveur.');
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.user?.id) throw new Error('Connecte ton compte KEEP pour modifier la visibilité.');

  let keeps = await loadOwnPersistedKeeps();
  let matches = matchingKeeps(track, keeps);

  if (matches.length === 0) {
    const created = await recordKeepDecision(track, visibility, {
      source: 'visibility_repair',
      repairedAt: new Date().toISOString(),
    });
    if (!created?.decisionId) throw new Error('Impossible de synchroniser ce KEEP avec ton profil.');
  } else {
    // Répare également les doublons hérités. Ainsi aucune ancienne décision
    // PUBLIC ne peut refaire apparaître la piste après un refresh ou via le lien
    // de profil partagé.
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
