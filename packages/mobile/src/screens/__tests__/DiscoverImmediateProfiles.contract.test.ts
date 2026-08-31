// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('Loki Découvertes immediate public profiles', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'DiscoverScreen.tsx'), 'utf8');

  it('does not require GPS before public profiles can be shown', () => {
    expect(source).toContain('if (!hasSearched || !searchPosition) return candidates');
    expect(source).not.toContain('if (!hasSearched || !searchPosition) return []');
  });

  it('supports direct username lookup', () => {
    expect(source).toContain('Rechercher un pseudo Loki');
    expect(source).toContain("profile.username.toLowerCase().includes(needle)");
    expect(source).toContain("committedQuery.trim().replace(/^@/, '').toLowerCase()");
  });

  it('keeps GPS as an optional proximity refinement', () => {
    expect(source).toContain('getCurrentPositionAsync');
    expect(source).toContain('le GPS affine ensuite la proximité');
  });
});
