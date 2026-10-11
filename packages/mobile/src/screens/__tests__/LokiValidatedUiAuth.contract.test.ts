// @ts-nocheck
import fs from 'fs';
import path from 'path';

const auth = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'authService.ts'), 'utf8').replace(/\r\n/g, '\n');
const settings = fs.readFileSync(path.resolve(__dirname, '..', 'ProfileSettingsMobileScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');
const home = fs.readFileSync(path.resolve(__dirname, '..', 'HomeScreenCompact.tsx'), 'utf8').replace(/\r\n/g, '\n');
const profile = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');
const battle = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'KeepBattleMobileGameV3.tsx'), 'utf8').replace(/\r\n/g, '\n');
const chat = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'MusicAgoraPanel.tsx'), 'utf8').replace(/\r\n/g, '\n');
const dock = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'GlobalChatDock.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('Loki validated UI + auth anti-regression', () => {
  it('cannot resurrect a locally signed-out account', () => {
    expect(auth).toContain("signOut({ scope: 'local' })");
    expect(auth).toContain("client.auth.signOut({ scope: 'local' })");
    expect(settings.indexOf('useUserStore.getState().logout()')).toBeLessThan(settings.indexOf('createAuthService(supabase).signOut()'));
  });

  it('keeps the validated full-screen chat without call/camera controls', () => {
    expect(dock).toContain('presentationStyle="fullScreen"');
    expect(chat).toContain('Rechercher une conversation');
    expect(chat).not.toMatch(/📹|🎥|APPEL VIDÉO|CAMÉRA/);
  });

  it('keeps clickable listen bubbles and the profile DNA gauge + Pulse tracks', () => {
    expect(home).not.toContain('testID="home-loki-pulse-track-bubbles"'); // Adel 05/10/2026 : plus de bulles Loki Pulse sur Écouter (elles restent sur le profil)
    expect(home).not.toContain('accessibilityLabel={`Écouter ${item.track.title}`}'); // Adel 05/10/2026 : plus de bulles Loki Pulse sur Écouter (elles restent sur le profil)
    expect(profile).toContain('testID="profile-music-dna-card"');
    expect(profile).toContain('styleCoveragePercent');
    expect(profile).toContain('testID="profile-loki-pulse-track-bubbles"');
    expect(profile).toContain('accessibilityLabel={`Écouter ${item.track.title} dans Loki Pulse`}');
  });

  it('keeps Battle daily FREE counters, 02:00 reset and recharge visible', () => {
    expect(battle).toContain('FREE gagnés aujourd’hui');
    expect(battle).toContain('FREE perdus aujourd’hui');
    expect(battle).toContain('JOURNÉE BATTLE · RESET 02:00');
    expect(battle).toContain('prochaine recharge');
  });
});
