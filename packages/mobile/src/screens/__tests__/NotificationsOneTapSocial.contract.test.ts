import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.resolve(__dirname, '..', 'NotificationsScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('Notifications one-tap social actions', () => {
  it('does not require an intermediate OUVRIR ICI action for profile notifications', () => {
    expect(source).toContain("if (profileUsername || notificationProfileId(item)) return null;");
    expect(source).not.toContain("if (profileUsername || notificationProfileId(item)) return 'OUVRIR ICI';");
  });

  it('shows follow and profile actions directly on the notification card', () => {
    expect(source).toContain("!isNewKeepNotification(item) && profileUsername");
    expect(source).toContain("'+ SUIVRE'");
    expect(source).toContain('VOIR LE PROFIL · @{profileUsername}');
    expect(source).toContain("navigation.navigate('PublicProfile', { username: profileUsername })");
  });
});
