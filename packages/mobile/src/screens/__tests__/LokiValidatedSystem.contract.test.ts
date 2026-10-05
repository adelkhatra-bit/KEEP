// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', '..', p), 'utf8').replace(/\r\n/g, '\n');
const app = read('App.tsx');
const dock = read('src/components/GlobalChatDock.tsx');
const chat = read('src/components/MusicAgoraPanel.tsx');
const home = read('src/screens/HomeScreenCompact.tsx');
const profile = read('src/screens/ProfilePublicScreen.tsx');
const battle = read('src/components/KeepBattleMobileGameV3.tsx');
const auth = read('src/services/authService.ts');
const form = read('src/components/UsernameAccountForm.tsx');

describe('Loki validated system checkpoint', () => {
  it('mounts one global SafeAreaProvider without touching navigation', () => {
    expect(app).toContain("SafeAreaProvider, initialWindowMetrics");
    expect(app).toContain("<SafeAreaProvider initialMetrics={initialWindowMetrics}>");
  });

  it('keeps the approved full-screen chat with no call/camera controls', () => {
    expect(dock).toContain('presentationStyle="fullScreen"');
    expect(chat).toContain('Rechercher une conversation');
    expect(chat).not.toMatch(/📹|🎥|APPEL VIDÉO|CAMÉRA/);
  });

  it('keeps the clickable listen bubbles and profile gauge + Pulse tracks', () => {
    expect(home).not.toContain('testID="home-loki-pulse-track-bubbles"'); // Adel 05/10/2026 : plus de bulles Loki Pulse sur Écouter (elles restent sur le profil)
    expect(home).not.toContain('openHomePulseTrack'); // Adel 05/10/2026 : plus de bulles Loki Pulse sur Écouter (elles restent sur le profil)
    expect(profile).toContain('testID="profile-music-dna-card"');
    expect(profile).toContain('styleCoveragePercent');
    expect(profile).toContain('testID="profile-loki-pulse-track-bubbles"');
  });

  it('keeps Battle daily FREE counters and recharge', () => {
    expect(battle).toContain('FREE gagnés aujourd’hui');
    expect(battle).toContain('FREE perdus aujourd’hui');
    expect(battle).toContain('JOURNÉE BATTLE · RESET 02:00');
    expect(battle).toContain('prochaine recharge');
  });

  it('distinguishes Supabase outage from wrong credentials and retries transient failures', () => {
    expect(auth).toContain("return 'auth_temporarily_unavailable'");
    expect(auth).toContain('async function retryTransient');
    expect(form).toContain("code === 'auth_temporarily_unavailable'");
    expect(auth).toContain("client.auth.signOut({ scope: 'local' })");
  });
});
