// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('global movable chat contract', () => {
  const dock = read(__dirname, '..', '..', 'components', 'GlobalChatDock.tsx');
  const notifications = read(__dirname, '..', 'NotificationsScreen.tsx');
  const service = read(__dirname, '..', '..', 'services', 'musicAgoraService.ts');

  it('supports the five user-selectable main surfaces', () => {
    for (const surface of ['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE']) {
      expect(service).toContain(surface);
      expect(notifications).toContain(surface);
    }
    expect(dock).toContain('chatSurfaces.includes(currentSurface)');
    expect(dock).toContain("name === 'Listen'");
    expect(dock).toContain("name === 'Discover'");
    expect(dock).toContain("['MyMusic','PlaylistSale','PlaylistSaleHistory']");
    expect(dock).toContain("name === 'Parties'");
    expect(dock).toContain("['Profile','PublicProfile','ProfileSettings','Offers','MusicConnections']");
  });

  it('keeps the floating chat movable and animated', () => {
    expect(dock).toContain('PanResponder.create');
    expect(dock).toContain("setSide('left')");
    expect(dock).toContain("setSide('right')");
    expect(dock).toContain('chatNudge');
    expect(dock).toContain('Tchat Loki · prêt à discuter');
  });

  it('opens chat placement settings from the activation notification', () => {
    expect(notifications).toContain("CHAT_ACTIVATION_AVAILABLE");
    expect(notifications).toContain("setChatSettingsOpen(true)");
    expect(notifications).toContain("CHOISIR OÙ IL APPARAÎT");
    expect(service).toContain("keep_agora_set_settings_v2");
  });
});
