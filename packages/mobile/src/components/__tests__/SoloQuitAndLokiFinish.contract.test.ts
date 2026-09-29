import fs from 'fs';
import path from 'path';
import { soloCostNotice, soloQuitNotice } from '../../services/battleHomeInfo';

// Adel (29/09/2026) : « s'il sort au bout de la 3e musique, est-ce que ça
// lui débite bien sa partie Solo et est-ce qu'un popup le prévient ? » +
// « une animation spéciale Loki à la fin » + onglet « Écouter » -> « Loki ».
const src = (...p: string[]) => fs.readFileSync(path.resolve(__dirname, '..', '..', ...p), 'utf8');

describe('Solo : débit annoncé et sortie confirmée', () => {
  const battle = src('components', 'KeepBattleMobileGameV3.tsx');
  it('prévient avant de jouer qu’une partie est comptée dès le départ', () => {
    expect(soloCostNotice({ limit: 10, remaining: 10, unlimited: false })).toBe("Cette partie utilise 1 Solo du jour : il t'en restera 9 sur 10. Même si tu quittes avant la fin, elle reste comptée.");
    expect(soloCostNotice({ limit: null, remaining: null, unlimited: true })).toBeNull();
    expect(battle).toContain('const costLine = soloCostNotice(soloDailyStatus);');
  });
  it('quitter en cours de partie demande confirmation et dit que la partie n’est pas rendue', () => {
    expect(soloQuitNotice({ limit: 10, remaining: 10, unlimited: false })).toContain('Il te restera 9 Solos sur 10');
    expect(battle).toContain("Alert.alert('Quitter la partie ?', soloQuitNotice(soloDailyStatus), [");
    expect(battle).toContain("{ text: 'Continuer à jouer', style: 'cancel' }");
  });
  it('le compteur Solo est relu à chaque retour à l’accueil Battle', () => {
    expect(battle).toContain('if (!enabled || solo) return;');
    expect(battle).toContain('}, [enabled, solo]);');
  });
});

describe('fin de partie Loki et onglet Loki', () => {
  it('Solo et Battle en ligne se terminent par l’animation LOKI (pilote natif coupé sur le web)', () => {
    const battle = src('components', 'KeepBattleMobileGameV3.tsx');
    const burst = src('components', 'LokiFinishBurst.tsx');
    expect(battle.match(/<LokiFinishBurst /g)?.length).toBe(2);
    expect(burst).toContain("const NATIVE = Platform.OS !== 'web';");
    expect(burst).not.toContain('useNativeDriver: true');
    expect(burst).toContain('isReduceMotionEnabled');
  });
  it('le premier onglet s’appelle Loki', () => {
    expect(src('navigation', 'Navigation.tsx')).toContain("tabBarLabel: 'Loki',");
  });
});
