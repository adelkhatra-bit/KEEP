// @ts-nocheck
import fs from 'fs';
import path from 'path';

const owner = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('owner DNA and Loki Pulse are separate', () => {
  it('keeps one compact DNA card and one separate Pulse track section', () => {
    expect((owner.match(/testID="profile-music-dna-card"/g) || []).length).toBe(1);
    expect((owner.match(/testID="profile-loki-pulse-track-bubbles"/g) || []).length).toBe(1);
    expect(owner).toContain('<Text style={s.dnaEyebrow}>LOKI MUSIC DNA</Text>');
    expect(owner).toContain('<Text style={s.lokiPulseEyebrow}>LOKI PULSE</Text>');
  });

  it('does not merge Pulse recommendations into DNA', () => {
    expect(owner).not.toContain('profilePulseExpanded');
    expect(owner).toContain('style={s.lokiPulseSection}');
  });
});
