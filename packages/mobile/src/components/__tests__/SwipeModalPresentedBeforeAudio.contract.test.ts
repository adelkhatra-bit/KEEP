import fs from 'fs';
import path from 'path';

// ERR-SWIPE-MODAL-NOT-PRESENTED-20261020 (build 445, iPhone) : session « Musiques partagées », la musique jouait
// mais le Swipe n'apparaissait pas et l'écran restait bloqué. L'audio ne démarre qu'après onShow, et une fenêtre
// jamais affichée est refermée (son coupé, écran rendu) avec un diagnostic automatique.
const modal = fs.readFileSync(path.resolve(__dirname, '..', 'MusicSwipeDeckModal.tsx'), 'utf8');

describe('Swipe iPhone : pas de son derrière une fenêtre invisible', () => {
  it('attend onShow avant de lancer un extrait sur iOS', () => {
    expect(modal).toContain("const [modalShown, setModalShown] = useState(Platform.OS !== 'ios');");
    expect(modal).toContain('setModalShown(true); }}');
    expect(modal).toContain('if (!modalShown) return () => { alive = false; };');
    expect(modal).toContain('current?.externalUrls?.youtube, index, modalShown]);');
  });

  it('représente une fenêtre non affichée (2 essais) puis la referme avec un diagnostic', () => {
    expect(modal).toContain('visible={visible && !hiddenForRetry}');
    expect(modal).toContain("reportAutoDiagnostic('SWIPE_MODAL_RETRY'");
    expect(modal).toContain('if (presentAttempt < 2) {');
    expect(modal).toContain("reportAutoDiagnostic('SWIPE_MODAL_NOT_PRESENTED'");
    expect(modal).toContain("reportAutoDiagnostic('SWIPE_MODAL_SHOWN_AFTER_RETRY'");
    expect(modal).toContain('}, 1200);');
  });
});
