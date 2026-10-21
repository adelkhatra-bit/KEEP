import fs from 'fs';
import path from 'path';

// ERR-SUPABASE-API-POLLING-20261021 — 32 447 appels API / 24 h, dont 18 967
// venant d'un seul onglet ordinateur laissé ouvert. Les rafraîchissements
// réseau passent par la source unique utils/visibleInterval.ts.

const SRC = path.resolve(__dirname, '..', '..');
const REPO = path.resolve(SRC, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('appels API périodiques — rien en arrière-plan', () => {
  const sites: Array<[string, number]> = [
    ['components/ProfileStoryBar.tsx', 4],
    ['components/MusicAgoraPanel.tsx', 4],
    ['components/CommunityChatHomeWidget.tsx', 1],
    ['components/GlobalChatDock.tsx', 1],
    ['components/WebCompanionCountdown.tsx', 1],
    ['components/WebCompanionSessionsPanel.tsx', 1],
    ['screens/PartiesScreen.tsx', 2],
    ['screens/PublicUserProfileScreen.tsx', 1],
    ['services/sessionCloudSyncService.ts', 1],
  ];

  it.each(sites)('%s passe par setVisibleInterval', (file, count) => {
    const source = read(file);
    expect(source).toContain("from '../utils/visibleInterval'");
    expect((source.match(/setVisibleInterval\(/g) || []).length).toBe(count);
  });

  it('les stories ne se rechargent plus toutes les 90 s onglet caché', () => {
    const source = read('components/ProfileStoryBar.tsx');
    expect(source).toContain('setVisibleInterval(bump, 90000, { catchUp: false })');
    expect(source).not.toContain('setInterval(bump, 90000)');
  });

  it('Super Admin : alertes en temps réel + filet de 5 min, arrêté quand l’onglet est caché', () => {
    const admin = fs.readFileSync(path.join(REPO, 'packages', 'admin', 'components', 'AdminLayout.tsx'), 'utf8');
    expect(admin).toContain('export const ADMIN_ALERTS_FALLBACK_MS = 5 * 60 * 1000;');
    expect(admin).toContain("document.visibilityState === 'hidden'");
    expect(admin).not.toContain('setInterval(() => void refresh(), 60000)');
    expect(admin).toContain(".channel('admin-bell')");
  });

  it('genres : seuls les morceaux sans genre sont envoyés, une fois par appareil', () => {
    const source = read('services/smartAlbumService.ts');
    expect(source).toContain('persistEnrichedGenres(enrichedTracks.filter((track) => missingGenreIds.has(track.id)))');
    expect(source).toContain("GENRE_PERSIST_MEMORY_KEY = 'loki:genres-persisted:v1'");
    expect(source).not.toMatch(/void persistEnrichedGenres\(enrichedTracks\);/);
  });
});
