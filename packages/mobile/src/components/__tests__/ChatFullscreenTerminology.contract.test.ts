// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('full-screen messenger terminology contract', () => {
  const panel = read(__dirname, '..', 'MusicAgoraPanel.tsx');
  const dock = read(__dirname, '..', 'GlobalChatDock.tsx');
  const notifications = read(__dirname, '..', '..', 'screens', 'NotificationsScreen.tsx');
  const side = read(__dirname, '..', 'NotificationSidePanel.tsx');

  it('never presents the full-screen messenger as a mini-chat', () => {
    expect(panel).not.toContain('MINI-CHAT ·');
    expect(notifications).not.toContain('Mini-chat actif');
    expect(notifications).not.toContain('Mini-chat désactivé');
    expect(notifications).toContain('MESSAGERIE LOKI');
  });

  it('describes only the movable access button as positionable', () => {
    expect(dock).toContain('POSITION DU BOUTON');
    expect(dock).not.toContain('POSITION DU TIROIR');
    expect(side).toContain('HAUTEUR DU BOUTON');
    expect(side).toContain('CÔTÉ DU BOUTON');
    expect(side).not.toContain('Tiroir latéral');
    expect(side).not.toContain('CÔTÉ DU TIROIR');
  });

  it('uses simple wording for starting a private group conversation', () => {
    expect(panel).toContain("accessibilityLabel=\"Créer une conversation\"");
    expect(panel).toContain("Sur invitation uniquement. Choisis les personnes");
    expect(panel).toContain('Nouveau groupe privé');
  });
});
