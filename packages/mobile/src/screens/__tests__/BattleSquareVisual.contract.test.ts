import fs from 'fs';
import path from 'path';

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'KeepBattleMobileGameV3.tsx'), 'utf8');
const styleLine = (name: string) => (src.match(new RegExp(`[\\s,]${name}: \\{[^}]*\\}`)) || [''])[0];

describe('Solo / Battle : la jaquette reste un CARRÉ qui descend jusqu\'aux 4 réponses (Adel 05/10/2026, ne plus revenir dessus)', () => {
  it('the shared visual style has NO fixed height (react-native-web ignores `height: undefined` and squashed it to 118 px on desktop)', () => {
    expect(styleLine('visual')).toContain('borderRadius: 20');
    expect(styleLine('visual')).not.toMatch(/\bheight:\s*\d+/);
  });
  it('solo and online visuals are 1:1 squares capped by the iPhone design width', () => {
    expect(styleLine('soloVisual')).toContain('aspectRatio: 1');
    expect(styleLine('arenaVisualActive')).toContain('aspectRatio: 1');
    expect(src).toContain('battle-solo-artwork-square');
    expect(src).toContain('const battleDesignWidth = Math.min(windowWidth, 430);');
  });
});
