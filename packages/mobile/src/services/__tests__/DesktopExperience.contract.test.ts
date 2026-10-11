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
    // Seuil bureau unique (11/10/2026) : 1024 px, jamais l'ancien 1100 px (PC Windows 175 % = 1098 px CSS).
    expect(design).toContain("export { DESKTOP_MIN_WIDTH } from '../layout/layoutMode'");
    expect(entrypoint).not.toContain('#root { zoom:1.4;');
  });

  it('propose un QR en deux régions uniquement sur les vrais écrans desktop', () => {
    const pairing = read('packages/mobile/src/components/WebCompanionPairingScreen.tsx');
    expect(pairing).toContain('const { isDesktop: isDesktopLayout } = useLayoutMode();');
    expect(pairing).toContain('s.desktopIntro');
    expect(pairing).toContain('s.qrColumn');
    expect(pairing).toContain('claimDesktopPairing');
  });

  it('le bureau a une vraie barre latérale (pas de barre du bas, pas de rail doublon)', () => {
    const nav = read('packages/mobile/src/navigation/Navigation.tsx');
    const side = read('packages/mobile/src/navigation/DesktopSidebar.tsx');
    expect(nav).toContain('<DesktopSidebar');
    expect(nav).toContain("display: isDesktop ? 'none' : 'flex'");
    expect(nav).toContain('if (isDesktop) return null;');
    expect(side).toContain('desktop-session-card');
    expect(fs.existsSync(path.join(root, 'packages/mobile/src/components/DesktopMusicWorkspaceRail.tsx'))).toBe(false);
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
