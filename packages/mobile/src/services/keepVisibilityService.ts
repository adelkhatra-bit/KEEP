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
  if (track.id && keep.track.id && String(track.id) === String(keep.track.id)) return true;
  if (track.isrc && keep.track.isrc && track.isrc.trim().toUpperCase() === keep.track.isrc.trim().toUpperCase()) return true;
  return normalize(track.title) === normalize(keep.track.title)
    && normalize(track.artist) === normalize(keep.track.artist);
}

/**
 * Source de vérité du bouton Public / Privé dans « Mes musiques ».
 *
 * Les anciens KEEP pouvaient exister localement avant de posséder un
 * keepDecisionId. Dans ce cas l'ancien bouton changeait seulement AsyncStorage :
 * après refresh le profil public relisait Supabase et le morceau réapparaissait.
 * Cette fonction résout/répare d'abord la décision distante, écrit la visibilité,
 * puis relit Supabase pour confirmer que la valeur est réellement persistée.
 */
export async function persistOwnTrackVisibility(
  track: CanonicalTrack,
  visibility: KeepVisibility,
): Promise<{ decisionId: string; visibility: KeepVisibility }> {
  if (!supabase) throw new Error('KEEP n’est pas connecté au serveur.');
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.user?.id) throw new Error('Connecte ton compte KEEP pour modifier la visibilité.');

  let keeps = await loadOwnPersistedKeeps();
  let existing = keeps.find((keep) => sameTrack(track, keep));
  let decisionId = existing?.decisionId;

  if (!decisionId) {
    const created = await recordKeepDecision(track, visibility, {
      source: 'visibility_repair',
      repairedAt: new Date().toISOString(),
    });
    decisionId = created?.decisionId;
    if (!decisionId) throw new Error('Impossible de synchroniser ce KEEP avec ton profil.');
  } else if (existing?.visibility !== visibility) {
    const updated = await updateKeepDecisionVisibility(decisionId, visibility);
    if (!updated) throw new Error('La visibilité n’a pas été enregistrée dans Supabase.');
  }

  // Vérification obligatoire : on ne montre jamais un succès local tant que la
  // source de vérité distante n'a pas confirmé la nouvelle valeur.
  keeps = await loadOwnPersistedKeeps();
  existing = keeps.find((keep) => keep.decisionId === decisionId) ?? keeps.find((keep) => sameTrack(track, keep));
  if (!existing || existing.visibility !== visibility) {
    throw new Error('La vérification serveur de la visibilité a échoué. Réessaie.');
  }

  return { decisionId: existing.decisionId, visibility: existing.visibility };
}
