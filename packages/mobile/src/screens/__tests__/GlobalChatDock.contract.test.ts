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
    for (const surface of ['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE','NOTIFICATIONS']) {
      expect(service).toContain(surface);
      expect(notifications).toContain(surface);
      expect(dock).toContain(surface);
    }
    expect(dock).toContain('chatSurfaces.includes(currentSurface)');
    expect(dock).toContain("name === 'Listen'");
    expect(dock).toContain("name === 'Discover'");
    expect(dock).toContain("['MyMusic','PlaylistSale','PlaylistSaleHistory']");
    expect(dock).toContain("name === 'Parties'");
    expect(dock).toContain("['Profile','PublicProfile','ProfileSettings','Offers','MusicConnections']");
    expect(dock).toContain("name === 'Notifications'");
  });

  it('renders a visible movable animated control and persists its position', () => {
    expect(dock).toContain('PanResponder.create');
    expect(dock).toContain("gesture.dx < -24 ? 'left' : gesture.dx > 24 ? 'right' : side");
    expect(dock).toContain('saveMusicAgoraPosition(nextSide, nextBottom)');
    expect(dock).toContain('chatNudge');
    expect(dock).toContain('Tchat Loki · prêt à discuter');
    expect(dock).toContain("outputRange: [0, 190]");
    expect(dock).toContain("fab: { width: 54, height: 54");
    expect(dock).toContain("fabLeft: { left: 12 }");
    expect(dock).toContain("fabRight: { right: 12 }");
  });

  it('renders the global placement popup instead of only changing hidden state', () => {
    expect(dock).toContain('<Modal visible={settingsOpen}');
    expect(dock).toContain('TCHAT FLOTTANT');
    expect(dock).toContain('Choisis où il apparaît');
    expect(dock).toContain('Le bouton reste discret, déplaçable à gauche ou à droite');
    expect(dock).toContain('settingsSurfaceGrid');
    expect(dock).toContain('accessibilityRole="checkbox"');
    expect(dock).toContain('if (!accountReady || !user) return null;');
  });

  it('opens visible chat placement settings from both activation notification versions', () => {
    expect(notifications).toContain("CHAT_ACTIVATION_AVAILABLE");
    expect(notifications).toContain("AGORA_ACTIVATE");
    expect(notifications).toContain('useGlobalChatStore.getState().openSettings()');
    expect(notifications).toContain("setChatSettingsOpen(true)");
    expect(notifications).toContain("OUVRIR LE TCHAT");
    expect(notifications).toContain("PLACEMENT");
    expect(notifications).toContain("NOTIFICATIONS");
    expect(service).toContain("keep_agora_set_settings_v2");
    expect(service).toContain("keep_agora_set_position");
  });
});
