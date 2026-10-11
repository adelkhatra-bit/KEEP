import { layoutModeFor, DESKTOP_MIN_WIDTH, PHONE_MAX_WIDTH } from '../layoutModeCore';

describe('layoutModeFor — seuil unique téléphone / tablette / bureau', () => {
  it('le téléphone (< 900 px) n’est jamais un bureau, même avec une souris', () => {
    expect(layoutModeFor(390, false)).toBe('phone');
    expect(layoutModeFor(712, true)).toBe('phone'); // PC avec panneau Claude ouvert
    expect(layoutModeFor(PHONE_MAX_WIDTH - 1, true)).toBe('phone');
  });
  it('un PC Windows à 175 % (1098 px CSS) reçoit le vrai rendu bureau', () => {
    expect(layoutModeFor(1098, true)).toBe('desktop');
    expect(layoutModeFor(DESKTOP_MIN_WIDTH, true)).toBe('desktop');
    expect(layoutModeFor(1440, true)).toBe('desktop');
  });
  it('tablette : largeur intermédiaire ou grand écran tactile sans souris', () => {
    expect(layoutModeFor(PHONE_MAX_WIDTH, true)).toBe('tablet');
    expect(layoutModeFor(1000, true)).toBe('tablet');
    expect(layoutModeFor(1180, false)).toBe('tablet'); // iPad
  });
  it('jamais de bureau hors web (application iOS / Android)', () => {
    expect(layoutModeFor(1366, true, false)).toBe('tablet');
  });
});
