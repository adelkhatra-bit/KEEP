import fs from 'fs';
import path from 'path';

const read = (file: string) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

describe('Loki Pulse tapped-track contract', () => {
  const modal = read(path.join(__dirname, '..', '..', 'components', 'MusicSwipeDeckModal.tsx'));
  const profile = read(path.join(__dirname, '..', 'ProfilePublicScreen.tsx'));

  it('passes the exact tapped Pulse track into the swipe modal', () => {
    expect(profile).toContain('setLokiPulseSelectedTrackId(item.track.id)');
    expect(profile).toContain('initialTrackId={lokiPulseSelectedTrackId}');
  });

  it('keeps the tapped track first and only shuffles the remaining tracks', () => {
    expect(modal).toContain("const requestedTrackId = String(initialTrackId || '').trim();");
    expect(modal).toContain('inputTracks.find((track) => track.id === requestedTrackId)');
    expect(modal).toContain('[requestedTrack, ...(loop ? shuffle(remainingTracks) : remainingTracks)]');
  });
});
