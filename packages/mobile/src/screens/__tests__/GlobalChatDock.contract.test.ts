// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('legacy Loki messenger decommission contract', () => {
  const app = read(__dirname, '..', '..', '..', 'App.tsx');
  const profile = read(__dirname, '..', 'ProfilePublicScreen.tsx');
  const panel = read(__dirname, '..', '..', 'components', 'NotificationSidePanel.tsx');
  const banner = read(__dirname, '..', '..', 'components', 'GlobalNotificationBanner.tsx');
  const contract = JSON.parse(read(__dirname, '..', '..', '..', '..', '..', 'config', 'keep-product-contract.json'));

  it('keeps the old floating chat out of the app and profile', () => {
    expect(app).not.toContain('GlobalChatDock');
    expect(profile).not.toContain('useGlobalChatStore');
    expect(profile).not.toContain('onOpenChat=');
  });

  it('keeps old messenger settings out of notifications', () => {
    for (const forbidden of ['MESSAGERIE LOKI','Afficher la messagerie','Notifications messages','OÙ L’AFFICHER','OUVRIR LA MESSAGERIE','chatSettingsOpen','toggleChatSurface','useGlobalChatStore']) {
      expect(panel).not.toContain(forbidden);
    }
  });

  it('keeps old chat launch actions out of notification banners', () => {
    expect(banner).not.toContain('useGlobalChatStore');
    expect(banner).not.toContain('openChatFromNotification');
    expect(banner).not.toContain('ouvrir le tchat');
  });

  it('locks the latest user decision in the canonical contract', () => {
    expect(contract.chatExperience.status).toBe('LEGACY_UI_DECOMMISSIONED_PENDING_NEW_MESSENGER');
    expect(contract.chatExperience.legacyGlobalDockMounted).toBe(false);
    expect(contract.chatExperience.legacySettingsVisible).toBe(false);
    expect(contract.chatExperience.legacyNotificationOpenAction).toBe(false);
  });
});
