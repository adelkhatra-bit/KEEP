// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Loki Pulse music bubbles persistence contract', () => {
  const home = read(__dirname, '..', 'HomeScreenCompact.tsx');
  const owner = read(__dirname, '..', 'ProfilePublicScreen.tsx');
  const visitor = read(__dirname, '..', 'PublicUserProfileScreen.tsx');
  const helper = read(__dirname, '..', '..', 'services', 'musicStyleBubbles.ts');

  it('keeps Loki Pulse bubbles directly visible on Listen home without visible DNA branding', () => {
    expect(home).toContain('testID="home-loki-pulse-bubbles"');
    expect(home).toContain('LOKI PULSE');
    expect(home).toContain('Tes bulles musicales');
    expect(home).not.toContain('<Text style={s.homeDnaEyebrow}>LOKI MUSIC DNA</Text>');
  });

  it('keeps owner profile bubbles visible without a collapsed DNA gate', () => {
    expect(owner).toContain('testID="profile-loki-pulse-bubbles-card"');
    expect(owner).toContain('testID="profile-music-style-bubbles"');
    expect(owner).toContain('<Text style={s.dnaEyebrow}>LOKI PULSE</Text>');
    expect(owner).not.toContain('ownerDnaExpanded');
    expect(owner).not.toContain("isFeatureEnabled('keep_dna')");
  });

  it('keeps visitor profile bubbles visible without a DNA accordion', () => {
    expect(visitor).toContain('testID="public-profile-loki-pulse-bubbles-card"');
    expect(visitor).toContain('testID="public-profile-music-style-bubbles"');
    expect(visitor).toContain('Ses bulles musicales');
    expect(visitor).not.toContain('dnaExpanded');
  });

  it('uses one deduplicating merge rule across home and profiles', () => {
    expect(helper).toContain('export function buildMusicStyleBubbles');
    expect(home).toContain('buildMusicStyleBubbles');
    expect(owner).toContain('buildMusicStyleBubbles');
    expect(visitor).toContain('buildMusicStyleBubbles');
  });
});
