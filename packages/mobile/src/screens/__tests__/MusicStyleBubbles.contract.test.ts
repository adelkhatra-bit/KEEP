// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('style bubbles stay in DNA, not Loki Music home', () => {
  const owner = read(__dirname, '..', 'ProfilePublicScreen.tsx');
  const visitor = read(__dirname, '..', 'PublicUserProfileScreen.tsx');
  const home = read(__dirname, '..', 'HomeScreenCompact.tsx');

  it('keeps owner style bubbles inside the collapsible DNA details', () => {
    expect(owner).toContain('ownerDnaExpanded ? (');
    expect(owner).toContain('testID="profile-music-style-bubbles"');
    expect(owner).toContain('openSelectionSwipe');
  });

  it('does not remove visited-profile style browsing', () => {
    expect(visitor).toContain('testID="public-profile-music-style-bubbles"');
  });

  it('does not show genre/style bubbles on Loki Music home', () => {
    expect(home).not.toContain('<MusicStyleBubbles');
    expect(home).not.toContain('homeStyleBubbles');
    expect(home).not.toContain('testID="home-loki-pulse-track-bubbles"'); // Adel 05/10/2026 : plus de bulles Loki Pulse sur Écouter (elles restent sur le profil)
  });
});
