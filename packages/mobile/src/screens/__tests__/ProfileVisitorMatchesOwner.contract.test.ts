import fs from 'fs';
import path from 'path';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const owner = read('ProfilePublicScreen.tsx');
const visitor = read('PublicUserProfileScreen.tsx');

describe('Profil visité = mêmes repères que le profil propriétaire', () => {
  it('keeps the same identity vocabulary and primary layout primitives without forcing pixel-identical offsets', () => {
    for (const src of [owner, visitor]) {
      expect(src).toContain('topMetricsBar:{');
      expect(src).toContain('topMetricSocialGroup:{');
      expect(src).toContain('ownerQuickActions:{');
      expect(src).toContain('hero:{');
      expect(src).toContain("identity:{flexDirection:'row',alignItems:'flex-start'");
      expect(src).toContain("avatar:{width:80,height:80,borderRadius:40");
      expect(src).toContain('usernameLine:{');
      expect(src).toContain('kindBadge:{');
    }
  });

  it('keeps the same PLUS entry and outlined quick actions on both profiles', () => {
    for (const src of [owner, visitor]) {
      expect(src).toMatch(/<Text style=\{(s|styles)\.topMetricMoreText\}>PLUS<\/Text>/);
      expect(src).toMatch(/<View style=\{(s|styles)\.ownerQuickActions\}>/);
      expect(src).toContain('variant="outline" size="medium" containerStyle={');
    }
  });

  it('lets the visited profile keep its inline event experience without changing the owner metrics contract', () => {
    expect(visitor).toContain('profileEventOpen');
    expect(visitor).toContain('openProfileEventInline');
    expect(visitor).toContain('Tu restes sur le profil de @{profile.username}');
    expect(owner).toContain('>Reprises</Text>');
    expect(owner).toContain('>FREE</Text>');
  });
});
