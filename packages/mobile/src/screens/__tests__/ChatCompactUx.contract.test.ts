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

  it('keeps compact chat truly full-screen instead of restoring the old content-sized drawer', () => {
    expect(panel).toContain("shellCompact:{position:'absolute',top:0,bottom:0,left:0,right:0");
    expect(panel).toContain('minHeight:0');
    expect(panel).not.toContain('compactPanelHeight');
    expect(dock).toContain('presentationStyle="fullScreen"');
    expect(dock).toContain('testID="loki-chat-fullscreen-modal"');
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
    expect(panel).toContain("browsingHistoryRef.current = browsingOlder");
  });

  it('keeps music selection readable, previewable and immediately validatable', () => {
    expect(panel).toContain("MORCEAU SÉLECTIONNÉ");
    expect(panel).toContain('TrackPreviewButton trackKey={sharedTrack.id}');
    expect(panel).toContain('shareOptionsOpen');
    expect(panel).toContain('shareAccordionBody');
    expect(panel).toContain('selectedMusicLockBadge');
    expect(panel).toContain('style={s.validateMusicPinned}');
    expect(panel).toContain("PARTAGER LE MORCEAU");
    expect(panel).toContain("selectedMusicThumbWrap:{width:80,height:80");
    expect(panel).toContain("selectedMusicThumb:{width:80,height:80");
  });

  it('keeps reaction buttons fixed-size inside the chat', () => {
    expect(panel).toContain("quickReaction:{width:48,height:42,flexGrow:0,flexShrink:0");
    expect(panel).toContain("{ label: '❤️', payload: '❤️' }");
  });

  it('supports long messages without growing the drawer', () => {
    expect(panel).toContain('maxLength={2000}');
    expect(panel).toContain('{draft.length}/2000');
    expect(panel).toContain('scrollEnabled');
    expect(panel).toContain("inputCompact:{height:56,minHeight:56,maxHeight:112");
  });

  it('shows ownership locks before payment choices and explains them inline', () => {
    expect(panel).toContain('🔒 PARTAGE UNIQUEMENT');
    expect(panel).toContain('(sharedTrack as any).canSell === false');
    expect(panel).toContain('selectedMusicLockBadge');
    expect(panel).toContain('shareTrackLockBadge');
    expect(panel).toContain('shareOwnershipOpen');
    expect(panel).toContain('PARTAGE AUTORISÉ · REVENTE BLOQUÉE');
    expect(panel).toContain('FREE verrouillé, afficher pourquoi');
    expect(panel).toContain('Paiement euro verrouillé, afficher pourquoi');
    expect(panel).toContain("paymentLocked ? '🔒 FREE' : 'FREE'");
    expect(panel).toContain("paymentLocked ? '🔒 €' : '€'");
  });

  it('measures the keyboard and keeps the adaptive drawer above it', () => {
    expect(panel).toContain("keyboardWillShow");
    expect(panel).toContain("keyboardDidShow");
    expect(panel).toContain('event.endCoordinates?.height');
    expect(panel).toContain('event.endCoordinates?.screenY');
    expect(panel).toContain("const compactBottom = 0;");
    expect(panel).toContain('top: 0');
    expect(panel).toContain('bottom: compactBottom');
    expect(panel).toContain('forceBottomRef.current = true');
    expect(panel).toContain('scrollToEnd({ animated: false })');
  });

  it('keeps updates mounted globally but completely silent', () => {
    expect(app).toContain("import AppUpdateBanner from './src/components/AppUpdateBanner'");
    expect(app).toContain('<AppUpdateBanner authReady={authReady} />');
    expect(update).toContain('return null;');
    expect(update).not.toContain('keep-manual-update-control');
    expect(update).not.toContain('NOUVELLE VERSION DISPONIBLE');
  });

  it('keeps public/private room controls reachable without scrolling', () => {
    expect(panel).toContain('accessibilityLabel="Ouvrir La Place"');
    expect(panel).toContain('Salon public · tout le monde peut rejoindre');
    expect(panel).toContain('accessibilityLabel="Créer une conversation"');
    expect(panel).toContain('accessibilityLabel="Gérer les membres du groupe"');
    expect(panel).not.toContain('<Text style={s.newConversationTitle}>Nouvelle conversation</Text>');
  });

  it('keeps a visible collapsed chat affordance', () => {
    expect(dock).toContain('drawerPeek');
    expect(dock).toContain('MESSAGERIE');
  });
});
