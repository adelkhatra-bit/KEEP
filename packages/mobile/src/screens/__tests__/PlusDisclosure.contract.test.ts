import fs from 'fs';
import path from 'path';

// Product contract: "Plus" is the one-word disclosure label on mobile, desktop, and Super Admin.
const read = (relative: string) =>
  fs.readFileSync(path.resolve(__dirname, '../../../../', relative), 'utf8').replace(/\r\n/g, '\n');

const displays = [
  'packages/mobile/src/components/ClampedText.tsx',
  'packages/mobile/src/components/MoreInfoLine.tsx',
  'packages/mobile/src/components/PayoutCheckoutSheet.tsx',
  'packages/mobile/src/components/PlaylistSaleImmersivePreview.tsx',
  'packages/mobile/src/screens/NotificationsScreen.tsx',
  'packages/mobile/src/screens/OffersScreen.tsx',
  'packages/mobile/src/screens/HomeScreenCompact.tsx',
  'packages/mobile/src/screens/ProfilePublicScreen.tsx',
  'packages/admin/components/ReleaseEvidence.tsx',
  'packages/admin/pages/moderation.tsx',
  'packages/admin/pages/problem-reports.tsx',
];

describe('Loki Music Plus disclosures and compact Listen home', () => {
  it.each(displays)('has no legacy En savoir plus visible in %s', (file) => {
    // Comments may mention the historic phrase; reject it in JSX-rendered text or string expressions.
    const source = read(file);
    expect(source).not.toMatch(/>\s*En savoir plus(?:\s*[›»]|\s*<)/i);
    expect(source).not.toMatch(/:\s*['\"]En savoir plus(?:\s*['\"›»]|\s*:)/i);
  });

  it('keeps the quota and FREE details inside Listen, not beside the main CTA', () => {
    const home = read('packages/mobile/src/screens/HomeScreenCompact.tsx');
    expect(home).toContain('const explainListenEconomy = () =>');
    expect(home).toContain("Alert.alert('Mes identifications'");
    expect(home).toContain('navigation.navigate(\'Offers\')');
    expect(home).not.toContain('RESTANTES · {listenEconomyStatus.used}');
    expect(home).not.toContain("Mon quota d'écoutes");
    expect(home).toContain("{homeAboutOpen ? 'Réduire' : 'Plus'}");
  });
});
