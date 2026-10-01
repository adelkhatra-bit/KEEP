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

  it('keeps the control visible and movable left/right near the bottom', () => {
    expect(dock).toContain('PanResponder.create');
    expect(dock).toContain("gesture.dx < -24 ? 'left' : gesture.dx > 24 ? 'right' : side");
    expect(dock).toContain('saveMusicAgoraPosition(nextSide, nextBottom)');
    expect(dock).toContain('fabWrap');
    expect(dock).toContain('fabLeft');
    expect(dock).toContain('fabRight');
    expect(dock).toContain('chatNudge');
  });

  it('opens chat settings as an expandable section from the notification bell', () => {
    expect(panel).toContain('chatSettingsOpen');
    expect(panel).toContain('MESSAGERIE LOKI');
    expect(panel).toContain('Afficher la messagerie');
    expect(panel).toContain('Notifications messages');
    expect(panel).toContain('OÙ L’AFFICHER');
    expect(panel).toContain('POSITION');
    expect(panel).toContain('OUVRIR LA MESSAGERIE');
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
