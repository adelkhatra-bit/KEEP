import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..', '..', '..', '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('Expérience desktop et mobile isolées', () => {
  it('la présentation grand écran n’agrandit plus toute l’application', () => {
    const design = read('packages/mobile/src/theme/designProfile.ts');
    const entrypoint = read('packages/mobile/index.js');
    expect(design).toContain("desktop: { kind: 'desktop', pageZoom: 1");
    expect(design).toContain("wide: { kind: 'wide', pageZoom: 1");
    expect(entrypoint).toContain('#root { zoom:1;');
    expect(entrypoint).not.toContain('#root { zoom:1.4;');
  });

  it('propose un QR en deux régions uniquement sur les vrais écrans desktop', () => {
    const pairing = read('packages/mobile/src/components/WebCompanionPairingScreen.tsx');
    expect(pairing).toContain('const isDesktopLayout = width >= 1100');
    expect(pairing).toContain('s.desktopIntro');
    expect(pairing).toContain('s.qrColumn');
    expect(pairing).toContain('claimDesktopPairing');
  });

  it('exploite le desktop sans créer une seconde bibliothèque de compte', () => {
    const shell = read('packages/mobile/src/components/DesktopMusicWorkspaceRail.tsx');
    const home = read('packages/mobile/src/screens/HomeScreenCompact.tsx');
    expect(shell).toContain("width < 1100");
    expect(shell).toContain("Platform.OS !== 'web'");
    expect(shell).toContain('navigation.navigate(screen)');
    expect(home).toContain('<DesktopMusicWorkspaceRail');
  });

  it('la boutique consomme réellement le paramétrage Super Admin, en conservant le mobile à 2 colonnes', () => {
    const boutique = read('packages/mobile/src/components/SellerBoutique.tsx');
    const admin = read('packages/admin/pages/remote-config.tsx');
    expect(boutique).toContain("'desktop_boutique_columns'");
    expect(boutique).toContain("'desktop_boutique_columns_wide'");
    expect(boutique).toContain(': 2;');
    expect(boutique).toContain('numColumns={storeColumns}');
    expect(admin).toContain("title: 'Apparence ordinateur'");
  });

  it('défi visible hors menu et mission stories sans bonus fictif', () => {
    const profile = read('packages/mobile/src/screens/ProfilePublicScreen.tsx');
    const modal = read('packages/mobile/src/components/EarReportModal.tsx');
    expect(profile).toContain('loki-profile-challenge-shortcut');
    expect(modal).toContain('loki-story-challenge');
    expect(modal).toContain("aucun bonus FREE n'est promis");
  });
});
