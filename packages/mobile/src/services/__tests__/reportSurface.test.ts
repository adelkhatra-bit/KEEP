import { pushReportSurface, currentReportSurface, describeReportLocation, registerReportLayer, topReportLayer, __resetReportSurfaceForTests } from '../reportSurface';

describe('localisation exacte d’une secousse (Adel 06/10/2026)', () => {
  beforeEach(() => __resetReportSurfaceForTests());
  it('la fenêtre la plus récente donne l’emplacement, avec la musique en cours', () => {
    const story = pushReportSurface({ label: 'Story de @adel', trackTitle: 'Alpha', index: 2 });
    expect(describeReportLocation('Profile')).toBe('Profile › Story de @adel › « Alpha » (3)');
    story.update({ label: 'Story de @adel', trackTitle: 'Beta', index: 3 });
    expect(currentReportSurface()?.trackTitle).toBe('Beta');
    story.remove();
    expect(describeReportLocation('Profile')).toBe('Profile');
  });
  it('la couche de la fenêtre la plus haute affiche le formulaire sur place', () => {
    const offA = registerReportLayer('a');
    const offB = registerReportLayer('b');
    expect(topReportLayer()).toBe('b');
    offB();
    expect(topReportLayer()).toBe('a');
    offA();
    expect(topReportLayer()).toBeNull();
  });
});
