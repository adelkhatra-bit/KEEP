// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) =>
  fs.readFileSync(path.resolve(...parts), 'utf8').replace(/\r\n/g, '\n');

describe('Loki mobile chat lift + Pulse audio tap contract', () => {
  const panel = read(__dirname, '..', 'MusicAgoraPanel.tsx');
  const home = read(__dirname, '..', '..', 'screens', 'HomeScreenCompact.tsx');
  const profile = read(__dirname, '..', '..', 'screens', 'ProfilePublicScreen.tsx');
  const swipe = read(__dirname, '..', 'MusicSwipeDeckModal.tsx');

  it('lifts the mobile chat composer slightly above the safe-area edge', () => {
    expect(panel).toContain("paddingBottom: keyboardInset > 0 ? 12 : Math.max(14, safeArea.bottom + 14)");
  });

  it('keeps Home Loki Pulse bubbles wired to the exact tapped track and audio unlock', () => {
    expect(home).not.toContain('const openHomePulseTrack = (trackId: string) => {'); // Adel 05/10/2026 : plus de bulles Loki Pulse sur Écouter (elles restent sur le profil)
    expect(home).not.toContain('unlockWebAudioForGesture();'); // Adel 05/10/2026 : plus de bulles Loki Pulse sur Écouter (elles restent sur le profil)
    expect(home).not.toContain('setHomePulseSelectedTrackId(trackId);'); // Adel 05/10/2026 : plus de bulles Loki Pulse sur Écouter (elles restent sur le profil)
    expect(home).not.toContain('onPress={() => openHomePulseTrack(item.track.id)}'); // Adel 05/10/2026 : plus de bulles Loki Pulse sur Écouter (elles restent sur le profil)
    expect(home).not.toContain('initialTrackId={homePulseSelectedTrackId}'); // Adel 05/10/2026 : plus de bulles Loki Pulse sur Écouter (elles restent sur le profil)
  });

  it('keeps Profile Loki Pulse artwork bubbles wired to the exact tapped track and audio unlock', () => {
    expect(profile).toContain('setLokiPulseSelectedTrackId(item.track.id);');
    expect(profile).toContain('setLokiPulseSwipeOpen(true);');
    expect(profile).toContain('accessibilityLabel={`Écouter ${item.track.title} dans Loki Pulse`}');
  });

  it('autoplays the selected preview in the shared swipe player', () => {
    expect(swipe).toContain('initialTrackId?: string | null;');
    expect(swipe).toContain('inputTracks.find((track) => track.id === requestedTrackId)');
    expect(swipe).toContain('await toggleTrackPreview(');
  });
});
