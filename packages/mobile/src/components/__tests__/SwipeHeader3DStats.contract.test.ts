import fs from 'fs';
import path from 'path';

const read = (name: string) => fs.readFileSync(path.resolve(__dirname,'..',name),'utf8');
const modal = read('MusicSwipeDeckModal.tsx');
const stats = read('TrackLikeButton.tsx');
const home = fs.readFileSync(path.resolve(__dirname,'..','..','screens','HomeScreenCompact.tsx'),'utf8');
const profile = fs.readFileSync(path.resolve(__dirname,'..','..','screens','ProfilePublicScreen.tsx'),'utf8');

describe('Loki Swipe desktop/mobile: compact glow counters above collection title', () => {
  it('keeps all three stats above title and outside the artwork stage', () => {
    expect(modal.indexOf('testID="deck-reactions-near-title"')).toBeLessThan(modal.indexOf('testID="swipe-artwork-stage"'));
    expect(modal.indexOf('testID="deck-reactions-near-title"')).toBeLessThan(modal.indexOf('testID="story-player"') + 3000);
    expect(modal).toContain('flexWrap:\'nowrap\'');
    expect(modal).toContain('transform:[{translateY:-5}]');
    expect(modal).toContain('testID="deck-reactions-animated-edge"');
  });
  it('uses three distinct glossy 3D gradients instead of flat counters', () => {
    expect(stats).toContain("const items = [{ k: 'LIKE'");
    expect(stats).toContain('<LinearGradient key={it.k}');
    expect(stats).toContain('style={s.pillGloss}');
    expect(stats).toContain("shadowOpacity: 0.7");
  });
  it('shows only Plus / Moins in expandable user-facing copy', () => {
    expect(home).toContain("homeAboutOpen ? 'Moins' : 'Plus'");
    expect(profile).toContain("ownerMusicInfoOpen ? 'Moins' : 'Plus'");
  });
});
