// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('global Loki messenger final contract', () => {
  const app = read(__dirname, '..', '..', '..', 'App.tsx');
  const dock = read(__dirname, '..', '..', 'components', 'GlobalChatDock.tsx');
  const notifications = read(__dirname, '..', 'NotificationsScreen.tsx');
  const service = read(__dirname, '..', '..', 'services', 'musicAgoraService.ts');
  const contract = JSON.parse(read(__dirname, '..', '..', '..', '..', '..', 'config', 'keep-product-contract.json'));

  it('mounts the messenger once at application root', () => {
    expect(app).toContain("import GlobalChatDock from './src/components/GlobalChatDock';");
    expect(app).toContain('{user ? <GlobalChatDock /> : null}');
  });

  it('supports all six requested surfaces without changing navigation', () => {
    for (const surface of ['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE','NOTIFICATIONS']) {
      expect(service).toContain(surface);
      expect(dock).toContain(surface);
    }
    expect(dock).toContain('chatSurfaceForRoute');
    expect(dock).toContain('chatSurfaces.includes(activeSurface)');
  });

  it('stays movable and configurable', () => {
    expect(dock).toContain('PanResponder.create');
    expect(dock).toContain("gesture.dx < -24 ? 'left' : gesture.dx > 24 ? 'right' : side");
    expect(dock).toContain('saveMusicAgoraPosition(nextSide, nextBottom)');
    expect(dock).toContain('<Modal visible={settingsOpen}');
    expect(dock).toContain('OÙ AFFICHER LA MESSAGERIE ?');
  });

  it('opens chat and placement from notifications', () => {
    expect(notifications).toContain('useGlobalChatStore.getState().openSettings()');
    expect(notifications).toContain('useGlobalChatStore.getState().open({');
    expect(notifications).toContain('CHAT_ACTIVATION_AVAILABLE');
    expect(notifications).toContain('AGORA_ACTIVATE');
  });

  it('locks the latest user decision in the canonical contract', () => {
    expect(contract.chatExperience.status).toBe('GLOBAL_MESSENGER_FINAL_ACTIVE');
    expect(contract.chatExperience.globalDockMountedAtAppRoot).toBe(true);
    expect(contract.chatExperience.allowedSurfaces).toEqual(['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE','NOTIFICATIONS']);
    expect(contract.chatExperience.doNotDecommission).toBe(true);
  });
});
