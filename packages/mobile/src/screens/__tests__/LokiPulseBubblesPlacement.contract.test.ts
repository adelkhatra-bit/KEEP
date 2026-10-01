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

  it('keeps the owner profile Loki Pulse bubbles visible outside the collapsible DNA details', () => {
    expect(owner).toContain('testID="profile-loki-pulse-card"');
    expect(owner).toContain('testID="profile-loki-pulse-bubbles"');
    expect(owner).toContain('<Text style={s.pulseBubbleEyebrow}>LOKI PULSE</Text>');
    expect(owner.indexOf('testID="profile-loki-pulse-card"')).toBeLessThan(owner.indexOf('ownerDnaExpanded ?'));
  });

  it('keeps visited-profile Loki Pulse bubbles visible independently of the DNA accordion', () => {
    expect(visitor).toContain('testID="visitor-loki-pulse-card"');
    expect(visitor).toContain('testID="visitor-loki-pulse-bubbles"');
    expect(visitor).toContain('<Text style={styles.pulseBubbleEyebrow}>LOKI PULSE</Text>');
    expect(visitor.indexOf('testID="visitor-loki-pulse-card"')).toBeLessThan(visitor.indexOf('dnaExpanded ?'));
  });
});
