import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('Profile hamburger one-tap contract', () => {
  it('sends single-destination menu entries directly to their real function', () => {
    expect(source).toContain("if (key === 'profile') { openFromMenu('ProfileSettings'); return; }");
    expect(source).toContain("if (key === 'music') { openFromMenu('MusicConnections'); return; }");
    expect(source).toContain("if (key === 'offers') { openFromMenu('Offers'); return; }");
    expect(source).toContain("if (key === 'sellPlaylists') { openFromMenu('PlaylistSale'); return; }");
    expect(source).toContain("if (key === 'receipts') { openFromMenu('PlaylistSale', { openPaymentHistory: true }); return; }");
  });

  it('opens QR, taste and chat controls directly instead of an explanatory intermediate screen', () => {
    expect(source).toContain("if (key === 'identityShare')");
    expect(source).toContain('setQrOpen(true)');
    expect(source).toContain("if (key === 'musicTaste')");
    expect(source).toContain('setPulseTasteOpen(true)');
    expect(source).toContain("if (key === 'chatSettings')");
    expect(source).toContain('useGlobalChatStore.getState().openSettings()');
  });

  it('keeps only true multi-choice sections inline in the same drawer', () => {
    expect(source).toContain('Réseaux/site, Créateur et Aide comportent plusieurs contrôles distincts');
    expect(source).toContain('setExpandedMenuItem(key)');
  });
});
