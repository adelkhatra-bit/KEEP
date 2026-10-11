import { layoutModeFor, isCompactDesktopWidth, DESKTOP_MIN_WIDTH, PHONE_MAX_WIDTH } from '../layoutModeCore';

describe('layoutModeFor — seuil unique téléphone / tablette / bureau', () => {
  it('un ordinateur (souris) reste un ordinateur dès 640 px : PC avec panneau Claude ouvert (712 px) = bureau', () => {
    expect(layoutModeFor(712, true)).toBe('desktop');
    expect(layoutModeFor(PHONE_MAX_WIDTH, true)).toBe('desktop');
    expect(layoutModeFor(640, true)).toBe('desktop');
  });
  it('téléphone : tactile sans souris, ou fenêtre < 640 px (iPhone inchangé)', () => {
    expect(layoutModeFor(390, false)).toBe('phone');
    expect(layoutModeFor(390, true)).toBe('phone');
    expect(layoutModeFor(639, true)).toBe('phone');
    expect(layoutModeFor(712, false)).toBe('phone');
    expect(layoutModeFor(PHONE_MAX_WIDTH - 1, false)).toBe('phone');
  });
  it('barre latérale compacte entre 640 et 1023 px, complète à partir de 1024 px', () => {
    expect(isCompactDesktopWidth(712)).toBe(true);
    expect(isCompactDesktopWidth(1023)).toBe(true);
    expect(isCompactDesktopWidth(1024)).toBe(false);
  });
  it('un PC Windows à 175 % (1098 px CSS) reçoit le vrai rendu bureau', () => {
    expect(layoutModeFor(1098, true)).toBe('desktop');
    expect(layoutModeFor(DESKTOP_MIN_WIDTH, true)).toBe('desktop');
    expect(layoutModeFor(1440, true)).toBe('desktop');
  });
  it('tablette : largeur intermédiaire ou grand écran tactile sans souris', () => {
    expect(layoutModeFor(PHONE_MAX_WIDTH, false)).toBe('tablet');
    expect(layoutModeFor(1000, false)).toBe('tablet');
    expect(layoutModeFor(1180, false)).toBe('tablet'); // iPad
  });
  it('jamais de bureau hors web (application iOS / Android)', () => {
    expect(layoutModeFor(1366, true, false)).toBe('tablet');
  });
});
