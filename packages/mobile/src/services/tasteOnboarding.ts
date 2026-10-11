// Questionnaire d'inscription obligatoire (Adel, 06/10/2026, IDEA-152). Module pur.
import type { PulsePreferenceState } from './pulsePreferenceService';

/**
 * Obligatoire tant que le compte n'a JAMAIS répondu ni repoussé le questionnaire (nouveaux comptes, y compris venant du mode démo, et comptes jamais sollicités).
 * Un compte qui l'a déjà repoussé (dismissCount > 0) garde l'ancien rappel facultatif : on ne force pas rétroactivement.
 */
export function needsTasteOnboarding(state: Pick<PulsePreferenceState, 'completed' | 'dismissCount'> | null | undefined): boolean {
  if (!state) return false;
  return !state.completed && Number(state.dismissCount || 0) === 0;
}

type SessionLike = { tracks?: Array<{ status?: string; track?: { genres?: string[] } }> };
/** Styles les plus fréquents dans l'historique local (démo / invité) : cochés d'avance, 8 au plus. */
export function topGenresFromSessions(sessions: SessionLike[] | undefined | null): string[] {
  const counts = new Map<string, { label: string; n: number }>();
  for (const session of sessions ?? []) {
    for (const entry of session.tracks ?? []) {
      if (entry.status === 'passed') continue;
      for (const raw of entry.track?.genres ?? []) {
        const label = String(raw ?? '').trim();
        if (!label) continue;
        const key = label.toLowerCase();
        const current = counts.get(key);
        counts.set(key, { label: current?.label ?? label, n: (current?.n ?? 0) + 1 });
      }
    }
  }
  return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 8).map((row) => row.label);
}
