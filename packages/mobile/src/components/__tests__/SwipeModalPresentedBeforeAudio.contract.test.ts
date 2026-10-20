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

  it('confie le filet iOS à un seul gardien, arrêté à la fermeture', () => {
    expect(modal).toContain("import { createPresentationWatchdog } from './modalPresentationWatchdog';");
    expect(modal).toContain('visible={visible && !hiddenForRetry}');
    expect(modal).toContain("if (Platform.OS === 'ios') presentationWatchdog.start();");
    expect(modal).toContain('return () => presentationWatchdog.stop();');
    expect(modal).toContain('onShow={() => { presentationWatchdog.shown(); setModalShown(true); }}');
    expect(modal).toContain('presentationWatchdog.stop();\n    setKeepPromptOpen(false);');
    expect(modal).toContain('closeRef.current = close;');
  });
});
