const fs = require('fs');
const path = require('path');

function read(...parts: string[]) {
  return fs.readFileSync(path.join(...parts), 'utf8');
}

describe('global compact chat UX contract', () => {
  const panel = read(__dirname, '..', '..', 'components', 'MusicAgoraPanel.tsx');
  const dock = read(__dirname, '..', '..', 'components', 'GlobalChatDock.tsx');
  const update = read(__dirname, '..', '..', 'components', 'AppUpdateBanner.tsx');
  const app = read(__dirname, '..', '..', '..', 'App.tsx');

  it('keeps the compact chat drawer fixed instead of content-sized', () => {
    expect(panel).toContain("shellCompact:{position:'absolute'");
    expect(panel).toContain('minHeight:0');
    expect(panel).toContain('compactPanelHeight');
    expect(panel).toContain('selectedMusicPreview');
    expect(panel).toContain('height:210');
  });

  it('always follows the sender to the newest message after send/reaction', () => {
    expect(panel).toContain('const followChatBottom =');
    expect(panel).toContain('browsingHistoryRef.current = false');
    expect(panel).toContain('followChatBottom(true)');
    expect(panel).toContain('distanceFromBottom > 56');
  });

  it('keeps manual history browsing possible', () => {
    expect(panel).toContain('onScroll={(event)');
    expect(panel).toContain('browsingHistoryRef.current = distanceFromBottom > 56');
  });

  it('keeps music selection readable and previewable', () => {
    expect(panel).toContain('APERÇU AVANT ENVOI');
    expect(panel).toContain('TrackPreviewButton trackKey={sharedTrack.id}');
    expect(panel).toContain('selectedMusicArtwork');
    expect(panel).toContain("fontSize:20");
  });

  it('keeps reaction buttons fixed-size inside the chat', () => {
    expect(panel).toContain("quickReaction:{width:42,height:38,flexGrow:0,flexShrink:0");
    expect(panel).toContain("['❤️','🔥','👏','🎵']");
  });

  it('keeps the desktop update control mounted globally', () => {
    expect(app).toContain("import AppUpdateBanner from './src/components/AppUpdateBanner'");
    expect(app).toContain('<AppUpdateBanner />');
    expect(update).toContain('keep-manual-update-control');
    expect(update).toContain('↻ Mise à jour');
    expect(update).toContain("if (width < 768) return null");
  });

  it('keeps a visible collapsed chat affordance', () => {
    expect(dock).toContain('drawerPeek');
    expect(dock).toContain('MESSAGERIE');
  });
});
