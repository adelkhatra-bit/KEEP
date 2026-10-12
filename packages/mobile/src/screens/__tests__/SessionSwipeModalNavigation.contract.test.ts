import fs from 'fs';
import path from 'path';

const screen = (file: string) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

describe('Session Swipe navigation and popup visibility (390×844 / PC)', () => {
  const home = screen('HomeScreenCompact.tsx');
  const sessions = screen('SessionHistoryScreen.tsx');
  const recap = screen('SessionRecapScreen.tsx');

  it('opens a saved session directly from the listening popup with an explicit microphone stop', () => {
    expect(home).toContain('const savedSessionId = requestEndSession();');
    expect(home).toContain("queuedSwipeSessionId.current = savedSessionId;");
    expect(home).toContain("setSessionPeekOpen(false);");
    expect(home).toContain('onDismiss={showQueuedSessionSwipe}');
    expect(home).toContain("navigation.navigate('SessionRecap', { sessionId, openSwipe: true });");
    expect(home).toContain('ARRÊTER ET SWIPER');
    expect(home).toContain('unlockWebAudioForGesture();');
  });

  it('prevents the transparent sessions stack from covering the Swipe modal', () => {
    expect(sessions).toContain("navigation.replace('SessionRecap', { sessionId: item.id, openSwipe: true })");
    expect(recap).toContain('const isFocused = useIsFocused();');
    expect(recap).toContain('InteractionManager.runAfterInteractions(');
    expect(recap).toContain('if (!isFocused || !route.params?.openSwipe');
  });

  it('centers session windows without touching App, Navigation, five tabs or adding a Web HTML', () => {
    expect(sessions).toContain("alignItems: 'center', justifyContent: 'center'");
    expect(sessions).toContain('width: Math.min(560, width - 32)');
    expect(home).toContain("maxWidth: desktopHome ? 580 : 400");
    expect(home).toContain("maxHeight: '78%'");
  });
});
