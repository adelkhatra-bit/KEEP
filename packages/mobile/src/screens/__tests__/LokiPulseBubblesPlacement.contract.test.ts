// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Loki Pulse bubbles permanent placement', () => {
  const home = read(__dirname, '..', 'HomeScreenCompact.tsx');
  const owner = read(__dirname, '..', 'ProfilePublicScreen.tsx');
  const visitor = read(__dirname, '..', 'PublicUserProfileScreen.tsx');

  it('keeps Loki Pulse bubbles directly on Listen home instead of Loki Music DNA', () => {
    expect(home).toContain('<Text style={s.homeDnaEyebrow}>LOKI PULSE</Text>');
    expect(home).toContain('testID="home-loki-pulse-bubbles"');
    expect(home).not.toContain('<Text style={s.homeDnaEyebrow}>LOKI MUSIC DNA</Text>');
  });

  it('keeps owner profile bubbles permanently visible without a DNA accordion', () => {
    expect(owner).toContain('testID="profile-loki-pulse-bubbles-card"');
    expect(owner).toContain('testID="profile-music-style-bubbles"');
    expect(owner).toContain('<Text style={s.dnaEyebrow}>LOKI PULSE</Text>');
    expect(owner).not.toContain('ownerDnaExpanded');
    expect(owner).not.toContain("isFeatureEnabled('keep_dna')");
  });

  it('keeps visited-profile bubbles permanently visible without a DNA accordion', () => {
    expect(visitor).toContain('testID="public-profile-loki-pulse-bubbles-card"');
    expect(visitor).toContain('testID="public-profile-music-style-bubbles"');
    expect(visitor).toContain('<Text style={styles.dnaEyebrow}>LOKI PULSE</Text>');
    expect(visitor).not.toContain('dnaExpanded');
  });
});
