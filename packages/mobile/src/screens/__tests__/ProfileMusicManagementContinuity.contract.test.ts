// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(...parts), 'utf8').replace(/\r\n/g, '\n');

describe('Profile music management and listening continuity', () => {
  const owner = read(__dirname, '..', 'ProfilePublicScreen.tsx');
  const myMusic = read(__dirname, '..', 'MyMusicScreen.tsx');
  const visitor = read(__dirname, '..', 'PublicUserProfileScreen.tsx');
  const swipe = read(__dirname, '..', '..', 'components', 'MusicSwipeDeckModal.tsx');

  it('uses the full owner collection as the single source of truth for style counts', () => {
    const start = owner.indexOf('const trackGenreOptions = useMemo(() => {');
    const end = owner.indexOf('// Mission C', start);
    const block = owner.slice(start, end);
    expect(block).toContain('for (const entry of profileKeptTracks)');
    expect(block).toContain("const labels = genres.length ? genres : ['Sans genre'];");
    expect(block).not.toContain('publicKeptTracks');
    expect(block).not.toContain('.slice(0, 12)');
    expect(owner).toContain("tracks: genreFolders.find((folder) => folder.genre === genre)?.entries.map((entry) => entry.track) ?? []");
  });

  it('opens an explicit music management mode instead of hiding controls under Playlists', () => {
    expect(myMusic).toContain("{ key: 'MUSIQUES', label: 'Musiques' }");
    expect(myMusic).toContain('MODE GESTION ACTIF');
    expect(myMusic).toContain('PUBLIC / PRIVÉ, SUPPRIMER et COLLECTION');
    expect(myMusic).toContain("if (!route?.params?.openManageMusic) return;");
    expect(myMusic).toContain("setActiveTab('MUSIQUES');");
  });

  it('keeps inline listening on the visited profile and chains playable tracks', () => {
    expect(visitor).toContain('const inlineQueueGenerationRef = useRef(0);');
    expect(visitor).toContain('const playInlineQueueItem = async');
    expect(visitor).toContain('void playInlineQueueItem(label, candidates, nextIndex, generation);');
    expect(visitor).toContain('void recordProfileSwipeListen(profile.id, track!.id)');
    expect(visitor).toContain('await stopTrackPreview(inlineStylePlayingKey)');
  });

  it('auto-continues the social Swipe after a preview naturally ends', () => {
    expect(swipe).toContain('const endAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);');
    expect(swipe).toContain('if (socialDiscoveryMode) {');
    expect(swipe).toContain('advanceIndex();');
    expect(swipe).toContain('}, 900);');
    expect(swipe).toContain('recordProfileSwipeListen(sourceProfileId, current.id)');
  });
});
