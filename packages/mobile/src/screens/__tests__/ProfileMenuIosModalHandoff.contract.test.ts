import fs from 'fs';
import path from 'path';

// ERR-HAMBURGER-IOS-MODAL-20261020 : sur iPhone, une fenêtre ouverte pendant la fermeture du menu ☰
// reste invisible derrière lui et bloque les touches. Toutes les fenêtres du menu attendent sa fermeture,
// et chacune ramène au menu quand on la ferme (IDEA-119).
const source = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8');

describe('menu ☰ : passage de relais vers les fenêtres sur iPhone', () => {
  it('ouvre Carte, Goûts, Défi et Messagerie seulement après la fermeture du menu sur iOS', () => {
    expect(source).toContain("if (Platform.OS === 'ios') setTimeout(() => setQrOpen(true), 450);");
    expect(source).toContain("if (Platform.OS === 'ios') setTimeout(() => setPulseTasteOpen(true), 450);");
    expect(source).toContain("if (Platform.OS === 'ios') setTimeout(() => setEarOpen(true), 450);");
    expect(source).toContain("if (Platform.OS === 'ios') setTimeout(() => useGlobalChatStore.getState().openSettings(), 450);");
  });

  it('ramène au menu après la Messagerie comme après les autres fenêtres', () => {
    expect(source).toMatch(/key === 'chatSettings'\) \{\n(\s+\/\/[^\n]*\n)?\s+returnToMenuAfterModal.current = true;/);
    expect(source).toContain('const chatSettingsOpen = useGlobalChatStore((state) => state.settingsOpen);');
    expect(source).toContain('}, [qrOpen, earOpen, pulseTasteOpen, chatSettingsOpen]);');
  });

  it('ne rouvre pas le menu pendant le délai iOS, avant que la fenêtre soit réellement ouverte', () => {
    expect(source).toContain('if (!returnToMenuAfterModal.current || !menuModalWasOpen.current) return;');
  });
});
