// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('global Loki messenger contract', () => {
  const app = read(__dirname, '..', '..', '..', 'App.tsx');
  const profile = read(__dirname, '..', 'ProfilePublicScreen.tsx');
  const dock = read(__dirname, '..', '..', 'components', 'GlobalChatDock.tsx');
  const panel = read(__dirname, '..', '..', 'components', 'NotificationSidePanel.tsx');
  const messenger = read(__dirname, '..', '..', 'components', 'MusicAgoraPanel.tsx');
  const service = read(__dirname, '..', '..', 'services', 'musicAgoraService.ts');

  it('mounts the chat once at application root, never only inside Profile', () => {
    expect(app).toContain("import GlobalChatDock from './src/components/GlobalChatDock';");
    expect(app).toContain('{user ? <GlobalChatDock /> : null}');
    expect(profile).not.toContain("import GlobalChatDock from '../components/GlobalChatDock';");
    expect(profile).not.toContain('<GlobalChatDock />');
  });

  it('supports all selectable chat surfaces and persists their selection', () => {
    for (const surface of ['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE','NOTIFICATIONS']) {
      expect(service).toContain(surface);
      expect(dock).toContain(surface);
      expect(panel).toContain(surface);
    }
    expect(dock).toContain('chatSurfaceForRoute');
    expect(dock).toContain('chatSurfaces.includes(activeSurface)');
    expect(dock).toContain('saveMusicAgoraSettings');
    expect(panel).toContain('toggleChatSurface');
    expect(panel).toContain('accessibilityRole="checkbox"');
  });

  it('announces and previews the latest sender only after explicit voice opt-in', () => {
    expect(dock).toContain("import * as Speech from 'expo-speech'");
    expect(dock).toContain('Message de');
    expect(dock).toContain('latestChatSender');
    expect(dock).toContain('chatNotificationTarget');
    expect(dock).toContain('drawerPeek');
    expect(dock).toContain('chatVoiceEnabled');
    expect(dock).toContain('saveMusicAgoraVoiceAnnouncements');
    expect(service).toContain('voiceAnnouncementsEnabled');
    expect(panel).toContain('Annonce vocale');
    expect(panel).toContain('Le contenu privé du message n’est jamais lu.');
    expect(dock).not.toContain('Speech.speak(item.body');
  });

  it('keeps the drawer visible in web preview without opening a fake conversation', () => {
    expect(dock).toContain("process.env.EXPO_PUBLIC_KEEP_PREVIEW === '1'");
    expect(dock).toContain('const previewOnly');
    expect(dock).toContain('const displayReady = accountReady || previewOnly');
    expect(dock).toContain("requestAccount('login')");
    expect(dock).toContain("previewOnly ? 'CONNEXION'");
  });

  it('opens into a large conversation drawer and returns to the edge tab', () => {
    expect(messenger).toContain("height:'68%'");
    expect(messenger).toContain('maxHeight:620');
    expect(messenger).toContain('onCompactClose');
    expect(dock).toContain('onCompactClose={closeChat}');
  });

  it('keeps the control visible and movable left/right near the bottom', () => {
    expect(dock).toContain('PanResponder.create');
    expect(dock).toContain("gesture.dx < -24 ? 'left' : gesture.dx > 24 ? 'right' : side");
    expect(dock).toContain('saveMusicAgoraPosition(nextSide, nextBottom)');
    expect(dock).toContain('fabWrap');
    expect(dock).toContain('fabLeft');
    expect(dock).toContain('fabRight');
    expect(dock).toContain('chatNudge');
    expect(dock).toContain('drawerPeek');
    expect(dock).toContain('drawerGrip');
    expect(dock).toContain("outputRange: [-50, 0]");
    expect(dock).toContain("outputRange: [50, 0]");
  });

  it('keeps bell messages, activity and settings separated and inline', () => {
    expect(panel).toContain("activeTab === 'MESSAGES'");
    expect(panel).toContain("activeTab === 'ACTIVITY'");
    expect(panel).toContain("activeTab === 'SETTINGS'");
    expect(panel).toContain('MESSAGES');
    expect(panel).toContain('ACTIVITÉ');
    expect(panel).toContain('RÉGLAGES');
    expect(panel).toContain('Tout reste ici, sans changer d’écran.');
    expect(panel).toContain('Alertes dans l’application');
    expect(panel).toContain('MESSAGERIE LOKI');
    expect(panel).toContain('Tiroir latéral');
    expect(panel).toContain('OUVRIR LA CONVERSATION');
    expect(panel).not.toContain("navigationRef");
    expect(panel).toContain('useGlobalChatStore.getState().open(target)');
    expect(panel).not.toContain("navigation.navigate");
  });

  it('is direct-message first and keeps the public Place secondary', () => {
    expect(messenger).toContain("'MESSAGES' | 'PLACE'");
    expect(messenger).toContain('loadMusicAgoraConversations');
    expect(messenger).toContain('loadMusicAgoraDirectMessages');
    expect(messenger).toContain('MESSAGES');
    expect(messenger).toContain('LA PLACE');
    expect(messenger).toContain('＋ PÉPITE');
  });
});
