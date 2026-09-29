import fs from 'fs';
import path from 'path';

// Adel (29/09/2026) : « même design et même configuration » sur le profil
// visité que sur son propre profil -- les utilisateurs gardent leurs repères.
// Ce contrat échoue si l'un des deux profils change ses compteurs ou sa
// rangée d'actions sans l'autre.
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const owner = read('ProfilePublicScreen.tsx');
const visitor = read('PublicUserProfileScreen.tsx');
const styleOf = (src: string, key: string) => {
  const m = src.match(new RegExp(`[^A-Za-z]${key}:\\{[^}]*\\}`));
  return m ? m[0].slice(1) : null;
};

describe('Profil visité = même design que le profil propriétaire', () => {
  it.each([
    'topMetricsBar', 'topMetricSocialGroup', 'topMetricSocialItem', 'topMetricSocialLast', 'topMetricSocialItemOn',
    'topMetricMore', 'topMetricMoreOn', 'topMetricMoreIcon', 'topMetricMoreText', 'topMetricValue', 'topMetricLabel',
    'topMetricSecondaryItem', 'ownerQuickActions', 'ownerQuickActionFull',
    'hero', 'identity', 'avatar', 'identityText', 'usernameLine', 'username', 'location', 'kindBadge', 'kindBadgeText', 'bio',
  ])('style %s identique sur les deux profils', (key) => {
    expect(styleOf(owner, key)).not.toBeNull();
    expect(styleOf(visitor, key)).toBe(styleOf(owner, key));
  });

  it('mêmes composants : bouton PLUS, groupe de compteurs, rangée de 3 MotionActionButton outline', () => {
    for (const src of [owner, visitor]) {
      expect(src).toContain('<Text style={STYLE.topMetricMoreText}>PLUS</Text>'.replace('STYLE', src === owner ? 's' : 'styles'));
      expect(src).toMatch(/<View style=\{(s|styles)\.ownerQuickActions\}>/);
      expect(src).toContain('variant="outline" size="medium" containerStyle={');
    }
  });
});
