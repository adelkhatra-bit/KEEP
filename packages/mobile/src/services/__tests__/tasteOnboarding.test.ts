import { needsTasteOnboarding, topGenresFromSessions } from '../tasteOnboarding';
import * as fs from 'fs';
import * as path from 'path';
const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');

describe('questionnaire d’inscription obligatoire (Adel, 06/10/2026)', () => {
  it('obligatoire tant que jamais répondu ni repoussé ; jamais forcé rétroactivement après un « plus tard »', () => {
    expect(needsTasteOnboarding({ completed: false, dismissCount: 0 })).toBe(true);
    expect(needsTasteOnboarding({ completed: true, dismissCount: 0 })).toBe(false);
    expect(needsTasteOnboarding({ completed: false, dismissCount: 2 })).toBe(false);
    expect(needsTasteOnboarding(null)).toBe(false);
  });
  it('styles cochés d’avance d’après l’historique démo / invité (les plus fréquents, sans les morceaux passés)', () => {
    const sessions = [{ tracks: [
      { status: 'kept', track: { genres: ['Pop', 'Dance'] } },
      { status: 'pending', track: { genres: ['pop'] } },
      { status: 'passed', track: { genres: ['Metal', 'Metal', 'Metal'] } },
      { status: 'kept', track: { genres: ['Afrobeats'] } },
    ] }];
    const top = topGenresFromSessions(sessions);
    expect(top[0]).toBe('Pop');
    expect(top).toContain('Afrobeats');
    expect(top).not.toContain('Metal');
    expect(topGenresFromSessions(undefined)).toEqual([]);
  });
  it('branché : fenêtre plein écran montée dans l’app, jamais en démo / invité, sans « Plus tard »', () => {
    expect(read('../../components/ProblemReportHost.tsx')).toContain('<TasteOnboardingGate />');
    const gate = read('../../components/TasteOnboardingGate.tsx');
    expect(gate).toContain('isDemoMode || isLocalGuest');
    expect(gate).toContain('required');
    expect(gate).toContain('prefillGenres={prefill}');
    const q = read('../../components/MusicTasteQuestionnaire.tsx');
    expect(q).toContain('{required ? null : <TouchableOpacity');
    expect(read('../../screens/ProfilePublicScreen.tsx')).toContain('!needsTasteOnboarding(state)');
  });
});
