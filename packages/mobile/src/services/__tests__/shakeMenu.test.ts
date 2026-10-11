import { SHAKE_ACTIONS, HELP_TIPS } from '../robotHelp';

describe('secousse = menu du robot (Adel 06/10/2026)', () => {
  it('propose les directions demandées et « Un souci »', () => {
    expect(SHAKE_ACTIONS.map((a) => a.key)).toEqual(['PULSE', 'COMMUNITY', 'PLAYLISTS', 'SEARCH', 'STORY', 'SOLO', 'REPORT']);
  });
  it('libellés courts (emoji + 2 mots max) et une explication pour chaque destination', () => {
    SHAKE_ACTIONS.forEach((a) => {
      expect(a.label.split(/\s+/).length).toBeLessThanOrEqual(3);
      expect(HELP_TIPS[a.key].length).toBeGreaterThan(0);
    });
  });
});
