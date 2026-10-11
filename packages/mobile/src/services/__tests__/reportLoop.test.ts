import { pushCrumb, readCrumbs, clearCrumbs, isAbusiveReport, composeReportUpdateLine } from '../reportLoop';

describe('boucle de réparation par secousse', () => {
  beforeEach(() => clearCrumbs());
  it('fil des dernières actions borné et sans doublon consécutif', () => {
    for (let i = 0; i < 40; i += 1) pushCrumb('screen', `Ecran${i}`, i);
    pushCrumb('screen', 'Ecran39', 99);
    const list = readCrumbs();
    expect(list).toHaveLength(25);
    expect(list[list.length - 1].label).toBe('Ecran39');
    expect(list[0].label).toBe('Ecran15');
  });
  it('insultes bloquées, texte normal accepté', () => {
    expect(isAbusiveReport('Tu es un CONNARD')).toBe(true);
    expect(isAbusiveReport('ta gueule appli')).toBe(true);
    expect(isAbusiveReport('la musique ne démarre pas sur Profil')).toBe(false);
    expect(isAbusiveReport('le classement affiche une erreur de pd')).toBe(false);
  });
  it('robot : réparé / mise à jour / pas de bug, avec l’écran', () => {
    expect(composeReportUpdateLine({ id: '1', screen: 'Profile', status: 'FIXED' })).toContain('ton profil');
    expect(composeReportUpdateLine({ id: '1', screen: 'Offers', status: 'NEEDS_UPDATE' }, 1)).toMatch(/mise à jour|Mets l’app à jour/);
    expect(composeReportUpdateLine({ id: '1', screen: 'X', status: 'NOT_A_BUG' })).toContain('« X »');
  });
});
