// @ts-nocheck
import fs from 'fs';
import path from 'path';

const mockCommitKeep = jest.fn();
jest.mock('../keepTrackAction', () => ({ commitKeep: (...args) => mockCommitKeep(...args) }));
jest.mock('../musicAgoraService', () => ({ loadMusicAgoraSharedTrack: jest.fn() }));
jest.mock('../connectedMusicLibrary', () => ({ checkOwnKeepLibrary: jest.fn() }));
jest.mock('../playlistSaleService', () => ({ loadMaskedPlaylistSaleTrackIds: jest.fn().mockResolvedValue([]) }));

import {
  isNewKeepNotification,
  maskedNewKeepCopy,
  keepFromNewKeepNotification,
  newKeepNotificationTrackId,
} from '../newKeepNotification';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
const read = (...p) => fs.readFileSync(path.resolve(repoRoot, ...p), 'utf8');

const oldNotif = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'NEW_PUBLIC_KEEP',
  title: 'Nouveau KEEP de @adel',
  body: 'Secret Song — Mystery Artist · ajouté à son profil.',
  data: {
    ownerProfileId: '22222222-2222-4222-8222-222222222222',
    username: 'adel',
    sourceProfileId: '44444444-4444-4444-8444-444444444444',
    trackId: '33333333-3333-4333-8333-333333333333',
    trackTitle: 'Secret Song',
    trackArtist: 'Mystery Artist',
    artworkUrl: 'http://x/a.jpg',
  },
  readAt: null,
  createdAt: '2026-10-02T00:00:00Z',
};

describe('Notification nouveau morceau Loki', () => {
  beforeEach(() => mockCommitKeep.mockReset());

  it('ne révèle jamais le titre ni l’artiste avant ajout, même pour une ancienne notification', () => {
    const copy = maskedNewKeepCopy(oldNotif as any);
    expect(isNewKeepNotification(oldNotif as any)).toBe(true);
    expect(copy.title).toContain('a une nouvelle story');
    expect(copy.body).toContain('avant qu’elle disparaisse');
    expect(`${copy.title} ${copy.body}`).not.toMatch(/Secret Song|Mystery Artist/);
    expect(newKeepNotificationTrackId(oldNotif as any)).toBe('33333333-3333-4333-8333-333333333333');
  });

  it('ajoute gratuitement via le chemin canonique keep-music-core et respecte Public/Privé', async () => {
    mockCommitKeep.mockResolvedValueOnce({ alreadyKept: false });
    const result = await keepFromNewKeepNotification(oldNotif as any, { id: '33333333-3333-4333-8333-333333333333' } as any, 'PUBLIC');
    expect(result).toEqual({ ok: true, alreadyKept: false });
    const [, , , options] = mockCommitKeep.mock.calls[0];
    expect(options.visibility).toBe('PUBLIC');
    expect(options.consumeCredit).toBe(false);
    expect(options.context.source).toBe('follow_notification');
    expect(options.context.notificationId).toBe(oldNotif.id);
    expect(options.context.creditPolicy).toBe('SOCIAL_ZERO_CREDIT');
    expect(options.context.sourceProfileId).toBe('44444444-4444-4444-8444-444444444444');
  });

  it('garde le parcours vente protégé', async () => {
    mockCommitKeep.mockRejectedValueOnce(new Error('SALE_PROTECTED'));
    const result = await keepFromNewKeepNotification(oldNotif as any, { id: '33333333-3333-4333-8333-333333333333' } as any, 'PRIVATE');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Pépite en vente');
  });

  it('notification : abonnement direct sans aucun chemin de désabonnement', () => {
    const component = read('packages/mobile/src/components/NewKeepNotificationActions.tsx');
    expect(component).toContain("supabase.rpc('keep_follow_profile'");
    expect(component).toContain("'+ S’ABONNER'");
    expect(component).toContain("'VOIR LE PROFIL'");
    expect(component).not.toContain('keep_unfollow_profile');
    expect(component).not.toContain("from('follows').delete");
  });

  it('affiche écouter/réécouter puis ajout gratuit et choix Public/Privé', () => {
    const component = read('packages/mobile/src/components/NewKeepNotificationActions.tsx');
    expect(component).toContain('▶ ÉCOUTER / RÉÉCOUTER');
    expect(component).toContain('AJOUTER GRATUITEMENT');
    expect(component).toContain("{ text: 'Privé'");
    expect(component).toContain("{ text: 'Public'");
    expect(component).toContain('sans retirer de Free');
    expect(component).toContain('revealedTrackLine(track)');
  });

  it('bannière et écran Notifications utilisent la même brique', () => {
    const banner = read('packages/mobile/src/components/GlobalNotificationBanner.tsx');
    const screen = read('packages/mobile/src/screens/NotificationsScreen.tsx');
    expect(banner).toContain('<NewKeepNotificationActions');
    expect(screen).toContain('<NewKeepNotificationActions');
    expect(banner).not.toContain("dataText(current, 'trackTitle')");
  });

  it('serveur : une vraie notification est requise, la vente reste protégée et aucun Free n’est débité', () => {
    const sql = read('supabase/migrations/20261003033000_new_public_keep_free_social.sql');
    expect(sql).toContain("n.profile_id = uid");
    expect(sql).toContain("upper(n.type) = 'NEW_PUBLIC_KEEP'");
    expect(sql).toContain("raise exception 'SALE_PROTECTED'");
    expect(sql).toContain("'charged',0");
    expect(sql).toContain("'SOCIAL_ZERO_CREDIT'");
    const edge = read('supabase/functions/keep-music-core/index.ts');
    expect(edge).toContain('keep_commit_follow_notification_decision');
    expect(edge).toContain("String((context as any)?.source || '') === 'follow_notification'");
  });

  it('serveur : le fanout reste asynchrone et transmet l’empreinte du premier découvreur', () => {
    const sql = read('supabase/migrations/20261003030100_public_track_fanout_origin_scale.sql');
    expect(sql).toContain('public_track_notification_fanout_jobs');
    expect(sql).toContain("'sourceProfileId'");
    expect(sql).toContain('keep_process_public_track_notification_fanout(40, 2000)');
    expect(sql).not.toContain('for v_follower in');
  });
});
