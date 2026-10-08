import fs from 'fs';
import path from 'path';
import InfoToggleIcon from '../InfoToggleIcon';

describe('aide commune mobile / Super Admin — issue #63', () => {
  it('affiche uniquement ⓘ fermé et ✕ ouvert', () => {
    expect(InfoToggleIcon({}).props.children).toBe('ⓘ');
    expect(InfoToggleIcon({ expanded: false }).props.children).toBe('ⓘ');
    expect(InfoToggleIcon({ expanded: true }).props.children).toBe('✕');
  });

  it.each([
    'components/ClampedText.tsx',
    'screens/OffersScreen.tsx',
    'screens/HomeScreenCompact.tsx',
    'screens/NotificationsScreen.tsx',
    'screens/PartiesScreen.tsx',
  ])('%s conserve les libellés accessibles, sans texte d’aide visible', file => {
    const source = fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
    expect(source).toContain('InfoToggleIcon');
    expect(source).toContain('accessibilityLabel=');
    const texts = [...source.matchAll(/<Text\b[^>]*>([\s\S]*?)<\/Text>/g)];
    for (const [, text] of texts) {
      const visibleText = text.replace(/accessibilityLabel=(?:\{[^}]*\}|"[^"]*")/g, '');
      expect(visibleText).not.toMatch(/En savoir plus|Réduire|Reduire/);
    }
  });

  it.each([
    'components/Hint.tsx',
    'components/ReleaseEvidence.tsx',
    'pages/problem-reports.tsx',
    'pages/moderation.tsx',
    'pages/index.tsx',
  ])('le Super Admin utilise le même composant dans %s', file => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../../../admin', file), 'utf8');
    expect(source).toContain("from '../../mobile/src/components/InfoToggleIcon'");
    expect(source).toContain('aria-label=');
    expect(source).not.toMatch(/>\s*En savoir plus\s*</);
  });
});
