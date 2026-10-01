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
    expect(panel).toContain("shellCompact:{position:'absolute'");
    expect(panel).toContain('height:470');
    expect(panel).toContain('minHeight:470');
    expect(panel).toContain('maxHeight:470');
    expect(panel).toContain("selectedMusic:{padding:8");
    expect(panel).toContain('maxHeight:250');
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
    expect(panel).toContain('PÉPITE SÉLECTIONNÉE');
    expect(panel).toContain('TrackPreviewButton trackKey={sharedTrack.id}');
    expect(panel).toContain('shareOptionsOpen');
    expect(panel).toContain('shareAccordionBody');
    expect(panel).toContain('selectedMusicLockBadge');
  });

  it('keeps reaction buttons fixed-size inside the chat', () => {
    expect(panel).toContain("quickReaction:{width:48,height:42,flexGrow:0,flexShrink:0");
    expect(panel).toContain("['❤️','🔥','👏','🎵']");
  });

  it('supports long messages without growing the drawer', () => {
    expect(panel).toContain('maxLength={2000}');
    expect(panel).toContain('{draft.length}/2000');
    expect(panel).toContain('scrollEnabled');
    expect(panel).toContain("inputCompact:{height:44,minHeight:44,maxHeight:44");
  });

  it('shows ownership locks before payment choices', () => {
    expect(panel).toContain('🔒 PARTAGE UNIQUEMENT');
    expect(panel).toContain('(sharedTrack as any).canSell === false');
    expect(panel).toContain('selectedMusicLockBadge');
    expect(panel).toContain('shareTrackLockBadge');
  });

  it('measures the keyboard and moves the fixed drawer above it', () => {
    expect(panel).toContain("keyboardWillShow");
    expect(panel).toContain("keyboardDidShow");
    expect(panel).toContain('event.endCoordinates?.height');
    expect(panel).toContain('event.endCoordinates?.screenY');
    expect(panel).toContain('bottom: keyboardInset > 0 ? keyboardInset + 8 : 78');
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
