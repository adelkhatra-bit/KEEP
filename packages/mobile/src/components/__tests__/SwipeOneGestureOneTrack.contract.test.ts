import fs from 'fs';
import path from 'path';

// ERR-SWIPE-DOUBLE-ADVANCE-20261020 : robot e2e/journeys/session-swipe-robot.cjs, code du build 445 :
// un seul glissement vers le haut faisait défiler 2 morceaux (2e déclenchement ~400 ms après le 1er).
const modal = fs.readFileSync(path.resolve(__dirname, '..', 'MusicSwipeDeckModal.tsx'), 'utf8');

describe('Swipe : un geste vers le haut = un seul morceau', () => {
  it('verrouille le geste après le premier passage au suivant', () => {
    expect(modal).toContain('const gestureConsumedRef = useRef(false);');
    expect(modal).toContain('if (gestureConsumedRef.current && now - lastNextAtRef.current < 900) return;');
    expect(modal).toContain('gestureConsumedRef.current = true;');
  });
  it('libère le verrou dès que le doigt se repose', () => {
    expect(modal).toContain('onStartShouldSetResponderCapture={(e) => { gestureConsumedRef.current = false;');
  });
  it('garde l’anti-double de 350 ms', () => {
    expect(modal).toContain('if (now - lastNextAtRef.current < 350) return;');
  });
});
