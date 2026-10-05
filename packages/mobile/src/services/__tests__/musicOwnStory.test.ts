import fs from 'fs';
import path from 'path';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) }));
jest.mock('../supabaseClient', () => ({ supabase: null }));

import { STORY_WINDOW_HOURS } from '../musicStoriesService';

const viewer = { id: 'me', username: 'moi', avatarUrl: null };

describe('story personnelle (loadOwnStory)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'musicStoriesService.ts'), 'utf8');
  const body = src.slice(src.indexOf('export async function loadProfileStory'), src.indexOf('Musiques EN VENTE dans les stories'));
  it('contains ONLY what the user shared publicly or put on sale (not identified/masked tracks)', () => {
    expect(body).toContain(".eq('visibility', 'PUBLIC')");
    expect(body).toContain(".eq('profile_id', viewer.id)");
    expect(body).toContain('enrichStoriesWithSales(');
    expect(body).not.toContain('sessions');
    expect(src).not.toContain('buildOwnStory');
  });
  it('returns null without a client, so the profile never breaks offline', async () => {
    const { loadOwnStory } = require('../musicStoriesService');
    expect(await loadOwnStory(viewer)).toBeNull();
  });
  it('keeps the 24h window constant', () => { expect(STORY_WINDOW_HOURS).toBe(24); });
});

describe('intégration : ta story dans la barre du profil', () => {
  const src = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');
  it('« Ta story » comes first, seen stories are greyed with a check and sorted last, no scrolling', () => {
    const rail = src('components', 'MusicStoryRail.tsx');
    expect(rail.indexOf('home-story-own')).toBeLessThan(rail.indexOf('visible.map('));
    expect(rail).toContain('orderStoriesForBar(');
    expect(rail).toContain('seenBadgeText');
    expect(rail).not.toContain('<ScrollView');
    expect(rail).not.toContain('horizontal');
  });
  it('the profile bar opens the existing Swipe in preview-only mode for your own story', () => {
    const bar = src('components', 'ProfileStoryBar.tsx');
    expect(bar).toContain('previewOnly={isOwnOpen}');
    expect(bar).toContain('loadOwnStory(');
  });
  it('there is a single story-rail component (no duplicate)', () => {
    expect(fs.existsSync(path.join(__dirname, '..', '..', 'components', 'StoryRail.tsx'))).toBe(false);
  });
});

describe('musiques en vente dans la story', () => {
  const { mergeSaleTracks, orderStoriesForBar, isSaleStoryTrack, SALE_TRACK_PREFIX } = require('../musicStoriesService');
  const story = (id: string, at: string) => ({ profileId: id, username: `u${id}`, avatarUrl: null, latestAt: at, followed: true, sameStyle: false, tracks: [{ id: `t${id}`, title: 'T', artist: 'A' }] });

  it('appends masked, audible sale tracks (title hidden) and never duplicates them', () => {
    const merged = mergeSaleTracks(story('1', '2026-10-05T10:00:00Z'), [{ trackId: 'x', previewUrl: 'https://a/x.m4a' }, { trackId: 'x', previewUrl: 'https://a/x.m4a' }]);
    const sale = merged.tracks.filter(isSaleStoryTrack);
    expect(sale).toHaveLength(1);
    expect(sale[0].id).toBe(`${SALE_TRACK_PREFIX}x`);
    expect(sale[0].title).toBe('Musique en vente');
    expect(sale[0].previewUrl).toBe('https://a/x.m4a');
  });

  it('puts seen stories last (greyed) and new ones first', () => {
    const a = story('a', '2026-10-05T10:00:00Z');
    const b = story('b', '2026-10-05T09:00:00Z');
    const ordered = orderStoriesForBar([a, b], { a: '2026-10-05T10:00:00Z' });
    expect(ordered.map((s: any) => s.profileId)).toEqual(['b', 'a']);
  });

  it('a new track relights a seen story (latestAt moves past the seen mark)', () => {
    const a = story('a', '2026-10-05T11:00:00Z');
    expect(orderStoriesForBar([a, story('b', '2026-10-05T09:00:00Z')], { a: '2026-10-05T10:00:00Z' })[0].profileId).toBe('a');
  });
});

describe('pastille de présence et taille des bulles', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');
  it('rail shows green/red only when presence is known, never a fake offline', () => {
    const rail = read('components', 'MusicStoryRail.tsx');
    expect(rail).toContain('online[story.profileId] !== undefined');
    expect(rail).toContain('ONLINE_GREEN');
    expect(rail).toContain('OFFLINE_RED');
  });
  it('profile bubbles use the profile photo size and the existing presence RPC (no duplicate source)', () => {
    expect(read('components', 'ProfileStoryBar.tsx')).toContain('loadProfilePresence(');
    expect(read('screens', 'ProfilePublicScreen.tsx')).toContain('size={80}');
  });
});

describe('photo de profil = bulle de ta story, anneau rose/bleu, boutique seule', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');
  it('the profile photo carries the story ring (no second own bubble in the rail)', () => {
    const bar = read('components', 'ProfileStoryBar.tsx');
    expect(bar).toContain('<StoryRing size={avatarSize}');
    expect(bar).not.toContain('own={{');
    expect(read('screens', 'ProfilePublicScreen.tsx')).not.toContain('s.profileStoryRow');
  });
  it('ring is pink for women, blue for men, vivid otherwise; seen stories stay visible (grey), never removed', () => {
    const rail = read('components', 'MusicStoryRail.tsx');
    expect(rail).toContain("tone === 'PINK' ? PINK");
    expect(rail).toContain('ringSeen');
    expect(read('components', 'ProfileStoryBar.tsx')).toContain("gender === 'FEMALE' ? 'PINK'");
  });
  it('followed sellers with shop items but no recent share still get a story', () => {
    expect(read('services', 'musicStoriesService.ts')).toContain('export async function loadSaleOnlyStories');
    expect(read('components', 'ProfileStoryBar.tsx')).toContain('loadSaleOnlyStories(');
  });
});

describe('qui a vu ma story', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');
  it('records a view when opening someone else\'s story and lists viewers (abonné / reprise) inside your own story viewer', () => {
    const bar = read('components', 'ProfileStoryBar.tsx');
    expect(bar).toContain('recordStoryView(story.profileId)');
    expect(bar).toContain('loadMyStoryViewers()');
    expect(bar).toContain('Abonné');
    expect(bar).toContain('Reprise');
    expect(read('components', 'MusicSwipeDeckModal.tsx')).toContain('overlay?: React.ReactNode');
    const sql = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261005140000_story_views.sql'), 'utf8');
    expect(sql).toContain('enable row level security');
    expect(sql).not.toMatch(/drop\s+(table|column)/i);
  });
});

describe('cercle de story sur la photo d\'un profil visité', () => {
  it('lights the ring on a visited profile photo and opens its story in the existing swipe', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'screens', 'PublicUserProfileScreen.tsx'), 'utf8');
    expect(src).toContain('loadProfileStory(');
    expect(src).toContain('<StoryRing size={80} unseen={visitedStoryUnseen}');
    expect(src).toContain('openVisitedStory');
  });
});

describe('« + » de la story et ordre de lecture', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');
  it('orders playback: lit ring → newest first, seen ring → oldest first', () => {
    const { orderTracksForPlayback } = require('../musicStoriesService');
    expect(orderTracksForPlayback(['c', 'b', 'a'], true)).toEqual(['c', 'b', 'a']);
    expect(orderTracksForPlayback(['c', 'b', 'a'], false)).toEqual(['a', 'b', 'c']);
    const bar = read('components', 'ProfileStoryBar.tsx');
    expect(bar).toContain('orderTracksForPlayback(story.tracks, unseenNow)');
    expect(read('screens', 'PublicUserProfileScreen.tsx')).toContain('orderTracksForPlayback(visitedStory.tracks, visitedStoryUnseen)');
  });
  it('the + badge opens a simple sheet to pin one of my public musics, server-checked', () => {
    const bar = read('components', 'ProfileStoryBar.tsx');
    expect(bar).toContain('testID="story-plus"');
    expect(bar).toContain('pinStoryTrack(track.trackId)');
    const sql = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261005160000_story_pins.sql'), 'utf8');
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('STORY_PIN_REQUIRES_PUBLIC_KEEP');
    expect(sql).not.toMatch(/drop\s+(table|column)/i);
  });
});

describe('slogans de story', () => {
  it('composes a stable, personalised teaser (max 2 lines in the UI)', () => {
    const { composeStoryTeaser } = require('../musicStoriesService');
    expect(composeStoryTeaser('alice', 'p:2026-10-05')).toBe(composeStoryTeaser('alice', 'p:2026-10-05'));
    expect(composeStoryTeaser('alice', 'p:2026-10-05')).toContain('alice');
    const set = new Set(Array.from({ length: 80 }, (_, i) => composeStoryTeaser('bob', `p${i}:d`)));
    expect(set.size).toBeGreaterThan(20);
    expect(fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'ProfileStoryBar.tsx'), 'utf8')).toContain('numberOfLines={compactScreen ? 1 : 2} ellipsizeMode="tail">{composeStoryTeaser(');
  });
});

describe('« + » : musique déjà en story', () => {
  it('tells the user a track is already in the story instead of adding it twice', () => {
    const bar = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'ProfileStoryBar.tsx'), 'utf8');
    expect(bar).toContain('inStoryIds.has(track.trackId)');
    expect(bar).toContain('Déjà dans ta story');
    expect(bar).toContain('✓ En story');
    expect(bar).toContain('previewTrack(track)');
  });
});

describe('Découvert par = premier découvreur partout (BUG-005) et pourquoi « Privé »', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');
  it('the swipe deck always resolves the origin from the server first-discovery, never from the profile owner', () => {
    const modal = read('components', 'MusicSwipeDeckModal.tsx');
    expect(modal).toContain('loadFirstDiscoveryOrigins(deckTracks.map((track) => track.id))');
    expect(modal).toContain('const canonicalOrigin = current ? firstOrigins[current.id] : undefined;');
    expect(read('services', 'trackOriginService.ts')).toContain("keep_track_first_discoveries");
  });
  it('the private badge explains the reason (in sale vs chosen) and lets the owner make a chosen-private track public', () => {
    const profile = read('screens', 'ProfilePublicScreen.tsx');
    expect(profile).toContain('explainFolderVisibility(folder, badgeLabel)');
    expect(profile).toContain('parce qu’${inSale.length > 1 ?');
    expect(profile).toContain("persistOwnTrackVisibility(entry.track, 'PUBLIC')");
  });
  it('the keep success card says the public keep enters the story automatically (no duplicate button)', () => {
    expect(read('components', 'KeepVisibilityChoiceModal.tsx')).toContain('✓ DÉJÀ DANS TA STORY · 24 h');
  });
});

describe('Certification + enchaînement des stories (Adel 05/10/2026)', () => {
  const fs2 = require('fs'); const path2 = require('path');
  const bar = fs2.readFileSync(path2.join(__dirname, '..', '..', 'components', 'ProfileStoryBar.tsx'), 'utf8');
  const deck = fs2.readFileSync(path2.join(__dirname, '..', '..', 'components', 'MusicSwipeDeckModal.tsx'), 'utf8');
  it('affiche la certification à côté du nom sans masquer le titre', () => {
    expect(bar).toContain('titleBadge={openTier');
    expect(bar).toContain("keep_public_certification_tiers");
    expect(deck).toContain('titleBadge ?');
    expect(deck).toContain('flexShrink:1');
  });
  it('propose la story suivante (non vues d\'abord) une fois la story terminée', () => {
    expect(bar).toContain('testID="story-next"');
    expect(deck).toContain('{endExtra}');
  });
});

describe('Mettre en story : retour clair, cercle allumé, musique en vente (Adel 05/10/2026)', () => {
  const fs3 = require('fs'); const path3 = require('path');
  const read = (...p: string[]) => fs3.readFileSync(path3.join(__dirname, '..', '..', ...p), 'utf8');
  const deck = read('components', 'MusicSwipeDeckModal.tsx');
  const bar = read('components', 'ProfileStoryBar.tsx');
  const svc = read('services', 'musicStoriesService.ts');
  it('prévient la rangée de stories à chaque ajout (le cercle de la photo s\'allume)', () => {
    expect(svc).toContain('notifyOwnStoryChanged();\n}');
    expect(bar).toContain('subscribeOwnStoryChanged');
    expect(deck).toContain("if (visibility === 'PUBLIC') notifyOwnStoryChanged();");
  });
  it('confirme dans la fenêtre (bouton vert + félicitations), pas seulement par alerte', () => {
    expect(deck).toContain('deck-story-congrats');
    expect(deck).toContain('addStoryButtonLit');
    expect(deck).toContain('✓ EN STORY · 24 H');
  });
  it('explique qu\'une musique en vente est masquée automatiquement', () => {
    expect(deck).toContain('deck-story-sale-note');
    expect(bar).toContain('offeredIds.has(track.trackId)');
  });
});

describe('Privé en vente ≠ masqué volontairement (Adel 05/10/2026)', () => {
  const fs4 = require('fs'); const path4 = require('path');
  const screen = fs4.readFileSync(path4.join(__dirname, '..', '..', 'screens', 'ProfilePublicScreen.tsx'), 'utf8');
  const svc = fs4.readFileSync(path4.join(__dirname, '..', 'musicStoriesService.ts'), 'utf8');
  it('explique au clic la raison exacte (en vente / volontaire) sur chaque musique privée', () => {
    expect(screen).toContain("'Musique EN VENTE'");
    expect(screen).toContain("'Musique masquée volontairement'");
    expect(screen).toContain('onLockPress={isPrivate');
  });
  it('seules les musiques PUBLIC entrent dans la story ; le privé volontaire n\'y entre jamais', () => {
    expect(svc).toContain(".eq('visibility', 'PUBLIC')");
  });
});
