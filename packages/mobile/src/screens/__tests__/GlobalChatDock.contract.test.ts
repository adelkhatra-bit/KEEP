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
  const service = read(__dirname, '..', '..', 'services', 'musicAgoraService.ts');
  const contract = JSON.parse(read(__dirname, '..', '..', '..', '..', '..', 'config', 'keep-product-contract.json'));

  it('mounts the messenger once at application root', () => {
    expect(app).toContain("import GlobalChatDock from './src/components/GlobalChatDock';");
    expect(app).toContain('{user ? <GlobalChatDock /> : null}');
    expect(profile).not.toContain("import GlobalChatDock from '../components/GlobalChatDock';");
  });

  it('supports every main surface without changing the five-tab navigation', () => {
    for (const surface of ['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE','NOTIFICATIONS']) {
      expect(service).toContain(surface);
      expect(dock).toContain(surface);
    }
    expect(dock).toContain('chatSurfaceForRoute');
    expect(dock).toContain('chatSurfaces.includes(activeSurface)');
  });

  it('keeps a movable control and persisted placement', () => {
    expect(dock).toContain('PanResponder.create');
    expect(dock).toContain("gesture.dx < -24 ? 'left' : gesture.dx > 24 ? 'right' : side");
    expect(dock).toContain('saveMusicAgoraPosition(nextSide, nextBottom)');
    expect(dock).toContain('chatNudge');
    expect(dock).toContain('<Modal visible={settingsOpen}');
  });

  it('keeps messenger settings and launcher available from the notification bell', () => {
    expect(panel).toContain('chatSettingsOpen');
    expect(panel).toContain('MESSAGERIE LOKI');
    expect(panel).toContain('Afficher la messagerie');
    expect(panel).toContain('Notifications messages');
    expect(panel).toContain('OÙ L’AFFICHER');
    expect(panel).toContain('OUVRIR LA MESSAGERIE');
    expect(profile).toContain('onOpenChat={(target) => useGlobalChatStore.getState().open(target ?? null)}');
  });

  it('locks the active messenger state in the canonical product contract', () => {
    expect(contract.chatExperience.status).toBe('GLOBAL_MESSENGER_FINAL_ACTIVE');
    expect(contract.chatExperience.globalDockMountedAtAppRoot).toBe(true);
    expect(contract.chatExperience.notificationsSurface).toBe(true);
    expect(contract.chatExperience.directLauncherInNotifications).toBe(true);
    expect(contract.chatExperience.allowedSurfaces).toEqual(['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE','NOTIFICATIONS']);
  });
});
