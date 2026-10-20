import fs from 'fs';
import path from 'path';

// ERR-SWIPE-MODAL-NOT-PRESENTED-20261020 (build 445, iPhone) : session « Musiques partagées », la musique jouait
// mais le Swipe n'apparaissait pas et l'écran restait bloqué. L'audio ne démarre qu'après onShow, et une fenêtre
// jamais affichée est refermée (son coupé, écran rendu) avec un diagnostic automatique.
const modal = fs.readFileSync(path.resolve(__dirname, '..', 'MusicSwipeDeckModal.tsx'), 'utf8');

describe('Swipe iPhone : pas de son derrière une fenêtre invisible', () => {
  it('attend onShow avant de lancer un extrait sur iOS', () => {
    expect(modal).toContain("const [modalShown, setModalShown] = useState(Platform.OS !== 'ios');");
    expect(modal).toContain('onShow={() => setModalShown(true)}');
    expect(modal).toContain('if (!modalShown) return () => { alive = false; };');
    expect(modal).toContain('current?.externalUrls?.youtube, index, modalShown]);');
  });

  it('referme une fenêtre jamais affichée et laisse une trace', () => {
    expect(modal).toContain("reportAutoDiagnostic('SWIPE_MODAL_NOT_PRESENTED'");
    expect(modal).toContain('}, 2500);');
    expect(modal).toContain("if (!visible) { setModalShown(Platform.OS !== 'ios'); return undefined; }");
  });
});
