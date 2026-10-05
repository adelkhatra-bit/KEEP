import { startStoryWatch, STORY_WATCH_MIN_MS, STORY_WATCH_PING_MS } from '../storyWatchService';
import { formatWatchDetail, formatWatchDuration } from '../storyActivity';

const UUID = '11111111-2222-3333-4444-555555555555';

describe('suivi de vue de story façon Instagram', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const make = () => {
    let t = 0;
    const calls: Array<[string, any]> = [];
    const rpc = jest.fn(async (fn: string, args: any) => { calls.push([fn, args]); return { data: fn === 'keep_story_watch_start' ? 'sess-1' : null, error: null }; });
    const tracker = startStoryWatch('owner', 5, rpc as any, () => t);
    return { tracker, calls, rpc, advance: async (ms: number) => { t += ms; await jest.advanceTimersByTimeAsync(ms); } };
  };

  it('ne compte aucune vue si le visiteur part avant le délai', async () => {
    const { tracker, rpc, advance } = make();
    await advance(STORY_WATCH_MIN_MS - 500);
    tracker.stop();
    await advance(STORY_WATCH_MIN_MS);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('compte la vue après le délai, suit musiques/écoute et envoie le départ', async () => {
    const { tracker, calls, advance } = make();
    await advance(STORY_WATCH_MIN_MS + 10);
    expect(calls[0][0]).toBe('keep_story_watch_start');
    expect(calls[0][1]).toEqual({ p_owner_id: 'owner', p_tracks_total: 5 });
    tracker.event({ type: 'shown', trackId: UUID, index: 1, total: 5 });
    tracker.event({ type: 'listen', trackId: UUID });
    await advance(STORY_WATCH_PING_MS);
    tracker.stop();
    const last = calls[calls.length - 1];
    expect(last[0]).toBe('keep_story_watch_chapters_ping');
    expect(last[1]).toMatchObject({ p_session_id: 'sess-1', p_tracks_seen: 2, p_last_track_id: UUID, p_listened: true, p_ended: true });
    expect(last[1].p_seconds).toBeGreaterThanOrEqual(12);
  });

  it('ne transmet jamais un identifiant de musique en vente (non UUID)', async () => {
    const { tracker, calls, advance } = make();
    await advance(STORY_WATCH_MIN_MS + 10);
    tracker.event({ type: 'shown', trackId: 'sale:abc', index: 0, total: 5 });
    tracker.stop();
    expect(calls[calls.length - 1][1].p_last_track_id).toBeNull();
  });

  it('départ pendant la création de la session : la session est tout de même clôturée', async () => {
    let t = 0;
    let release: (v: any) => void = () => {};
    const calls: string[] = [];
    const rpc = jest.fn((fn: string) => { calls.push(fn); return fn === 'keep_story_watch_start' ? new Promise((r) => { release = r; }) : Promise.resolve({ data: null, error: null }); });
    const tracker = startStoryWatch('owner', 1, rpc as any, () => t);
    t = STORY_WATCH_MIN_MS + 5;
    await jest.advanceTimersByTimeAsync(STORY_WATCH_MIN_MS + 5);
    tracker.stop();
    release({ data: 'sess-9', error: null });
    await jest.advanceTimersByTimeAsync(5);
    expect(calls).toEqual(['keep_story_watch_start', 'keep_story_watch_chapters_ping']);
  });
});

describe('détail de vue pour le propriétaire', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  it('durée lisible', () => {
    expect(formatWatchDuration(12)).toBe('12 s');
    expect(formatWatchDuration(75)).toBe('1 min 15 s');
  });
  it('regarde maintenant', () => {
    const d = formatWatchDetail({ seconds: 8, tracksSeen: 1, tracksTotal: 3, listened: true, watching: true, leftAt: null }, now);
    expect(d.status).toBe('regarde maintenant');
    expect(d.detail).toBe('8 s · 1 musique sur 3 · écouté');
  });
  it('parti avant la fin sans écouter', () => {
    const d = formatWatchDetail({ seconds: 4, tracksSeen: 1, tracksTotal: 4, listened: false, watching: false, leftAt: '2026-10-05T11:57:00Z' }, now);
    expect(d.status).toBe('parti il y a 3 min');
    expect(d.detail).toBe('4 s · 1 musique sur 4 · pas écouté');
  });
});

import { formatLastShared } from '../storyActivity';
describe('fiche membre sans story', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  it('dit depuis quand rien n’a été partagé', () => {
    expect(formatLastShared(null, now)).toBe('Rien partagé pour l’instant');
    expect(formatLastShared('2026-10-05T07:00:00Z', now)).toBe('Dernier partage : il y a 5 h');
    expect(formatLastShared('2026-10-01T12:00:00Z', now)).toBe('Dernier partage : il y a 4 j');
    expect(formatLastShared('2026-09-14T12:00:00Z', now)).toBe('Dernier partage : il y a 3 sem.');
  });
  it('la fiche est centrée et affichée pour les bulles sans story', () => {
    const fs = require('fs'); const path = require('path');
    const quick = fs.readFileSync(path.join(__dirname, '../../components/SourceProfileQuickView.tsx'), 'utf8');
    const bar = fs.readFileSync(path.join(__dirname, '../../components/ProfileStoryBar.tsx'), 'utf8');
    expect(quick).toContain("justifyContent:'center'");
    expect(quick).toContain('Pas de story du jour');
    expect(bar).toContain('noStory');
  });
});

describe('profil : Playlists et Artistes = mêmes cartes premium que Styles (Adel 05/10/2026)', () => {
  it('utilisent ProfileStyleCard dans la même grille', () => {
    const fs = require('fs'); const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../../screens/ProfilePublicScreen.tsx'), 'utf8');
    expect(src).toContain('accessibilityLabel={`Écouter la playlist ${playlist.name}');
    expect(src).toContain('accessibilityLabel={`Écouter ${item.label}, ${item.entries.length} morceaux en Swipe`}');
    expect((src.match(/<ProfileStyleCard/g) || []).length).toBeGreaterThanOrEqual(3);
  });
});

describe('bouton « mettre en story » et ordre de la rangée (Adel 05/10/2026)', () => {
  const fs = require('fs'); const path = require('path');
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, ...p), 'utf8');
  it('après un ajout : bouton gris tout de suite + popup « C’est bon »', () => {
    const deck = read('../../components/MusicSwipeDeckModal.tsx');
    expect((deck.match(/confirmStoryAdded\(/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(deck).toContain('C’est bon ✓');
    expect(deck).toContain('checking || justAddedNow || alreadyInStory ? s.addStoryButtonDone : s.addStoryButtonLit');
  });
  it('les stories vues restent avant les membres sans story', () => {
    const rail = read('../../components/MusicStoryRail.tsx');
    expect(rail).toContain('...unseenOthers, ...seenStories, ...friendsNoStory');
  });
});

import { formatStoryCountdown } from '../storyActivity';
describe('chronomètre 24 h de la story', () => {
  const added = '2026-10-05T10:00:00Z';
  it('décompte le temps restant', () => {
    expect(formatStoryCountdown(added, Date.parse('2026-10-05T10:00:00Z'))).toBe('24:00:00');
    expect(formatStoryCountdown(added, Date.parse('2026-10-05T10:29:00Z'))).toBe('23:31:00');
    expect(formatStoryCountdown(added, Date.parse('2026-10-06T09:59:53Z'))).toBe('00:00:07');
  });
  it('s’arrête à zéro et ignore une date invalide', () => {
    expect(formatStoryCountdown(added, Date.parse('2026-10-07T10:00:00Z'))).toBe('00:00:00');
    expect(formatStoryCountdown('nope')).toBeNull();
    expect(formatStoryCountdown(null)).toBeNull();
  });
  it('le deck affiche le chronomètre', () => {
    const fs = require('fs'); const path = require('path');
    expect(fs.readFileSync(path.join(__dirname, '../../components/MusicSwipeDeckModal.tsx'), 'utf8')).toContain('useStoryCountdown(');
  });
});

import { rankBadgeFor } from '../storyActivity';
describe('classement de la semaine sur les bulles', () => {
  it('médailles top 3, étoile top 10, rien en dessous ni sous 3 points', () => {
    expect(rankBadgeFor(1, 57)?.icon).toBe('🥇');
    expect(rankBadgeFor(2, 4)?.icon).toBe('🥈');
    expect(rankBadgeFor(3, 3)?.icon).toBe('🥉');
    expect(rankBadgeFor(7, 5)?.icon).toBe('⭐');
    expect(rankBadgeFor(11, 9)?.icon).toBe('✨');
    expect(rankBadgeFor(1, 2)).toBeNull();
    expect(rankBadgeFor(undefined, 10)).toBeNull();
  });
  it('la bulle affiche le badge en haut à gauche, sans toucher aux autres pastilles', () => {
    const fs = require('fs'); const path = require('path');
    const rail = fs.readFileSync(path.join(__dirname, '../../components/MusicStoryRail.tsx'), 'utf8');
    const bar = fs.readFileSync(path.join(__dirname, '../../components/ProfileStoryBar.tsx'), 'utf8');
    expect(rail).toContain("rankBadge: { position: 'absolute', left: -2, top: -2");
    expect(rail).toContain('testID={`story-rank-${profileId}`}');
    expect(bar).toContain('loadStoryRanking()');
    expect(bar).toContain('ranking={ranking}');
  });
});

describe('barre des 5 onglets toujours visible (Adel 05/10/2026)', () => {
  it('Navigation affiche la barre persistante sous les écrans empilés, sans doublon sur les onglets', () => {
    const fs = require('fs'); const path = require('path');
    const nav = fs.readFileSync(path.join(__dirname, '../../navigation/Navigation.tsx'), 'utf8');
    expect(nav).toContain('function PersistentTabBar()');
    expect(nav).toContain("if (rootRoute === 'Main') return null;");
    expect(nav).toContain('<PersistentTabBar />');
    for (const label of ['Loki Music', 'Découvertes', 'Playlists', 'Soirées', 'Profil']) expect(nav).toContain(`label: '${label}'`);
    expect(nav).toContain('confirmLeaveGame(go)');
  });
});

import { formatSince } from '../storyActivity';
describe('fiche membre : dernière musique partagée + dernière connexion', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  it('durées courtes', () => {
    expect(formatSince('2026-10-05T11:59:40Z', now)).toBe('à l’instant');
    expect(formatSince('2026-10-05T11:20:00Z', now)).toBe('il y a 40 min');
    expect(formatSince('2026-10-05T07:00:00Z', now)).toBe('il y a 5 h');
    expect(formatSince('2026-10-01T12:00:00Z', now)).toBe('il y a 4 j');
    expect(formatSince(null, now)).toBeNull();
  });
  it('la fiche lit la dernière musique et la présence réelles', () => {
    const fs = require('fs'); const path = require('path');
    const quick = fs.readFileSync(path.join(__dirname, '../../components/SourceProfileQuickView.tsx'), 'utf8');
    const svc = fs.readFileSync(path.join(__dirname, '../musicStoriesService.ts'), 'utf8');
    expect(quick).toContain('loadLastShared(nextProfile.id)');
    expect(quick).toContain('loadProfilesActivity([nextProfile.id])');
    expect(quick).toContain('testID="quick-last-seen"');
    expect(svc).toContain("export async function loadLastShared");
  });
});

describe('chapitres : temps exact passé dans chaque musique (Adel 05/10/2026)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it('mesure chaque chapitre de son arrivée jusqu’à la musique suivante', async () => {
    let t = 0;
    const calls: Array<[string, any]> = [];
    const rpc = jest.fn(async (fn: string, args: any) => { calls.push([fn, args]); return { data: fn === 'keep_story_watch_start' ? 'sess-c' : null, error: null }; });
    const tracker = startStoryWatch('owner', 16, rpc as any, () => t);
    const advance = async (ms: number) => { t += ms; await jest.advanceTimersByTimeAsync(ms); };
    tracker.event({ type: 'shown', trackId: 'a', index: 0, total: 16 });
    await advance(25000);
    tracker.event({ type: 'shown', trackId: 'b', index: 1, total: 16 });
    await advance(9000);
    tracker.stop();
    const last = calls[calls.length - 1][1];
    expect(last.p_ended).toBe(true);
    expect(last.p_tracks_seen).toBe(2);
    const byIndex = Object.fromEntries(last.p_chapters.map((c: any) => [c.i, c.s]));
    expect(byIndex[0]).toBe(25);
    expect(byIndex[1]).toBe(9);
  });
  it('affiche « Chapitres : 1 · 25 s  2 · 9 s » pour le propriétaire, 4 au plus', () => {
    const base = { seconds: 34, tracksSeen: 2, tracksTotal: 16, listened: true, watching: false, leftAt: null };
    expect(formatWatchDetail({ ...base, chapters: [{ index: 0, seconds: 25 }, { index: 1, seconds: 9 }] }).chaptersLine).toBe('Chapitres : 1 · 25 s  2 · 9 s');
    const many = Array.from({ length: 6 }, (_, i) => ({ index: i, seconds: 3 }));
    expect(formatWatchDetail({ ...base, chapters: many }).chaptersLine).toBe('Chapitres : 1 · 3 s  2 · 3 s  3 · 3 s  4 · 3 s … +2');
    expect(formatWatchDetail({ ...base }).chaptersLine).toBeNull();
  });
});

import { ownBadgeFor, ownBadgeMessage } from '../storyActivity';
describe('badge à débloquer (cadenas) — Adel 05/10/2026', () => {
  it('🔒 au départ, ✨ dès 3 points, ⭐/médailles selon le rang', () => {
    expect(ownBadgeFor(null, 0)).toMatchObject({ icon: '🔒', locked: true });
    expect(ownBadgeFor(40, 2)).toMatchObject({ icon: '🔒', locked: true });
    expect(ownBadgeFor(30, 3)).toMatchObject({ icon: '✨', locked: false });
    expect(ownBadgeFor(8, 6)).toMatchObject({ icon: '⭐', locked: false });
    expect(ownBadgeFor(1, 57)).toMatchObject({ icon: '🥇', locked: false });
  });
  it('explique comment débloquer avec la progression', () => {
    const m = ownBadgeMessage({ shares: 1, reprises: 0, followers: 0, score: 1, rank: 20 });
    expect(m.title).toContain('🔒');
    expect(m.body).toContain('Il te manque 2 points');
    expect(m.body).toMatch(/story/);
    expect(m.body).toMatch(/lien d’affiliation/);
    const done = ownBadgeMessage({ shares: 4, reprises: 1, followers: 1, score: 9, rank: 5 });
    expect(done.title).toContain('⭐');
    expect(done.body).toContain('n°5');
  });
  it('branché sur le profil : badge au-dessus de la photo, lu depuis le serveur', () => {
    const fs = require('fs'); const path = require('path');
    const bar = fs.readFileSync(path.join(__dirname, '../../components/ProfileStoryBar.tsx'), 'utf8');
    expect(bar).toContain('testID="story-own-badge"');
    expect(bar).toContain('loadMyStoryStats()');
  });
});

import { ownBadgeFor as ownBadgeFor2, ownBadgeMessage as ownBadgeMessage2 } from '../storyActivity';
import { buildReferralLink } from '../referralShare';
describe('déblocage du badge : mois offert → parrainage ou Premium (Adel 05/10/2026)', () => {
  const base = { shares: 5, reprises: 1, followers: 1, score: 10, rank: 4 };
  it('verrouillé si le mois offert est fini sans parrainage ni formule, même avec beaucoup de points', () => {
    expect(ownBadgeFor2(4, 10, false)).toMatchObject({ icon: '🔒', locked: true });
    const m = ownBadgeMessage2({ ...base, eligible: false, graceDaysLeft: 0, referralsQualified: 0, premium: false });
    expect(m.needsReferral).toBe(true);
    expect(m.body).toContain('parraine 1 ami');
    expect(m.body).toContain('Premium');
    expect(m.body).toContain('plus tu montes, plus ta bulle est vue');
  });
  it('pendant le mois offert : annonce les jours restants et la règle d’après', () => {
    const m = ownBadgeMessage2({ ...base, eligible: true, graceDaysLeft: 12, referralsQualified: 0, premium: false });
    expect(m.needsReferral).toBe(false);
    expect(m.body).toContain('Offert encore 12 jours');
    expect(m.body).toContain('parrainer 1 ami');
  });
  it('un parrainage validé ou Premium retire l’avertissement', () => {
    expect(ownBadgeMessage2({ ...base, eligible: true, graceDaysLeft: 0, referralsQualified: 1, premium: false }).body).not.toContain('Offert encore');
    expect(ownBadgeMessage2({ ...base, eligible: true, graceDaysLeft: 12, referralsQualified: 0, premium: true }).body).not.toContain('Offert encore');
  });
  it('lien de parrainage = URL canonique + ?ref=CODE', () => {
    expect(buildReferralLink('kabc123')).toBe('https://adelkhatra-bit.github.io/KEEP/?ref=KABC123');
    expect(buildReferralLink('')).toBe('https://adelkhatra-bit.github.io/KEEP/');
  });
  it('le profil lit les stats v2 et propose « Parrainer un ami »', () => {
    const fs = require('fs'); const path = require('path');
    const bar = fs.readFileSync(path.join(__dirname, '../../components/ProfileStoryBar.tsx'), 'utf8');
    const svc = fs.readFileSync(path.join(__dirname, '../musicStoriesService.ts'), 'utf8');
    expect(bar).toContain("text: 'Parrainer un ami'");
    expect(svc).toContain("rpc('keep_my_story_stats_v2')");
  });
});

describe('« Découvert par » mis en avant : contour lumineux qui pulse (Adel 05/10/2026)', () => {
  it('le contour est superposé aux deux « Découvert par » sans gêner les appuis, et respecte « réduire les animations »', () => {
    const fs = require('fs'); const path = require('path');
    const deck = fs.readFileSync(path.join(__dirname, '../../components/MusicSwipeDeckModal.tsx'), 'utf8');
    const glow = fs.readFileSync(path.join(__dirname, '../../components/GlowRing.tsx'), 'utf8');
    expect(deck).toContain('<GlowRing radius={14} testID="deck-source-glow" />');
    expect(deck).toContain('<GlowRing radius={21} testID="deck-source-button-glow" />');
    expect(glow).toContain('pointerEvents="none"');
    expect(glow).toContain('isReduceMotionEnabled');
    expect(glow).toContain('Animated.loop');
    expect(glow).toContain('toValue: 0.15');
  });
});

describe('Le cœur « j’aime » partout (Adel 05/10/2026, IDEA-106/107)', () => {
  const fs = require('fs'); const path = require('path');
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, ...p), 'utf8');
  it('un seul composant de réactions : cœur ÉTEINT gris au départ, rouge ensuite, « pas aimé » à côté, une réaction par musique', () => {
    const btn = read('../../components/TrackLikeButton.tsx');
    expect(btn).toContain("{liked ? '❤' : '♡'}");
    expect(btn).toContain('color: colors.textMuted');
    expect(btn).toContain("heartOn: { color: '#FF2D55' }");
    expect(btn).not.toContain('GlowRing');
    expect(btn).toContain('👎');
    expect(btn).toContain('disabled={locked}');
    expect(btn).toContain('deck-like-badge-count');
  });
  it('présent dans TOUS les lecteurs : Swipe (stories, profils, sessions, y compris musiques payantes) et aperçu des collections en vente ; absent de ma propre collection', () => {
    const deck = read('../../components/MusicSwipeDeckModal.tsx');
    expect(deck).toContain("likeMode = 'auto'");
    expect(deck).toContain('<TrackLikeButton liked={trackLikes.liked.has(key)} disliked={trackLikes.disliked.has(key)}');
    expect(deck).toContain('testID="deck-like-count"');
    expect(read('../../components/PlaylistSaleImmersivePreview.tsx')).toContain('testID="sale-like-button"');
    expect(read('../../components/ProfileStoryBar.tsx')).toContain("likeMode={isOwnOpen ? 'count-only' : 'auto'}");
    expect(read('../../screens/ProfilePublicScreen.tsx')).toContain('likeMode="off"');
  });
  it('UNE seule table de données : track_likes (déjà lue par l’algorithme), id réel même pour « sale:… »', () => {
    const svc = read('../trackLikesService.ts');
    expect(svc).toContain("from('track_likes')");
    expect(svc).not.toContain('story_likes');
    const { likeKey } = require('../trackLikeKey');
    expect(likeKey('sale:abc-123')).toBe('abc-123');
    expect(likeKey('plain-id')).toBe('plain-id');
  });
});

import { composeNudge, nudgeCombinationCount } from '../likeNudges';
describe('petits messages pour réagir : jamais les mêmes, mots de jeunes (Adel 05/10/2026)', () => {
  it('beaucoup de combinaisons, courts, avec cœur ou pouce', () => {
    for (const kind of ['PLAYING', 'SKIPPED', 'AFTER_LIKE', 'AFTER_DISLIKE'] as const) {
      expect(nudgeCombinationCount(kind)).toBeGreaterThanOrEqual(100);
      const lines = new Set(Array.from({ length: 80 }, (_, i) => composeNudge(kind, `s${i}`)));
      expect(lines.size).toBeGreaterThan(25);
      for (const line of lines) expect(line.length).toBeLessThanOrEqual(110);
    }
    expect(composeNudge('SKIPPED', 'a')).toMatch(/👎|❤|réaction|kiff|délire|zappe/i);
  });
  it('ne répète jamais un des derniers messages', () => {
    const seen: string[] = [];
    for (let i = 0; i < 8; i += 1) { const line = composeNudge('PLAYING', `x${i % 2}`, seen); expect(seen).not.toContain(line); seen.push(line); }
  });
  it('branché dans le lecteur : pendant l’écoute (9 s), au zapping sans réaction, après un j’aime / pas aimé', () => {
    const fs = require('fs'); const path = require('path');
    const deck = fs.readFileSync(path.join(__dirname, '../../components/MusicSwipeDeckModal.tsx'), 'utf8');
    expect(deck).toContain("showNudge('SKIPPED')");
    expect(deck).toContain("showNudge('PLAYING')");
    expect(deck).toContain("showNudge(reaction === 'LIKE' ? 'AFTER_LIKE' : 'AFTER_DISLIKE')");
    expect(deck).toContain('testID="deck-like-nudge"');
    expect(deck).toContain('❤ {count} · 👎 {dislikeCount}');
  });
  it('« pas aimé » : ajout seulement, compteurs réservés au partageur, aucune suppression côté lecteur', () => {
    const fs = require('fs'); const path = require('path');
    const svc = fs.readFileSync(path.join(__dirname, '../trackLikesService.ts'), 'utf8');
    expect(svc).toContain("from('track_dislikes')");
    expect(svc).toContain("rpc('keep_my_track_dislike_counts'");
    expect(svc).not.toMatch(/\.delete\s*\(/);
  });
});
