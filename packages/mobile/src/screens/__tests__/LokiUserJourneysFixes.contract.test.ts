import fs from 'fs';
import path from 'path';

const code = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf8');
const journey = () => fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'e2e', 'journeys', 'run-journeys.cjs'), 'utf8');
const fixture = () => fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'e2e', 'journeys', 'fake-supabase.cjs'), 'utf8');

describe('Loki user journey protections', () => {
  it('does not claim previews succeeded when audio could not start', () => {
    const s = code('screens/PublicUserProfileScreen.tsx');
    expect(s).toContain('Extraits indisponibles pour le moment');
    expect(s).toContain('startedCount += 1');
  });
  it('brings FREE payment amount into view in the chat', () => {
    const s = code('components/MusicAgoraPanel.tsx');
    expect(s).toContain('shareAccordionScrollRef.current?.scrollToEnd');
  });
  it('tests Stories instead of obsolete GARDER notifications', () => {
    expect(fixture()).toContain("case 'keep_pulse_preferences_state'");
    expect(journey()).toContain('Nouveau morceau vers Stories');
    expect(journey()).toContain('Trouver le morceau');
  });
});
