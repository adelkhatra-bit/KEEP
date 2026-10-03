// @ts-nocheck
import fs from 'fs';
import path from 'path';

const mockRpc = jest.fn();
jest.mock('../supabaseClient', () => ({ supabase: { rpc: (...args) => mockRpc(...args) } }));
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
    trackId: '33333333-3333-4333-8333-333333333333',
    trackTitle: 'Secret Song',
    trackArtist: 'Mystery Artist',
    artworkUrl: 'http://x/a.jpg',
  },
  readAt: null,
  createdAt: '2026-10-02T00:00:00Z',
};

describe('Notification nouveau morceau Loki', () => {
  beforeEach(() => mockRpc.mockReset());

  it('ne révèle jamais le titre ni l’artiste avant ajout, même pour une ancienne notification', () => {
    const copy = maskedNewKeepCopy(oldNotif as any);
    expect(isNewKeepNotification(oldNotif as any)).toBe(true);
    expect(copy.title).toContain('Nouveau morceau chez');
    expect(copy.body).toContain('Titre et artiste masqués');
    expect(`${copy.title} ${copy.body}`).not.toMatch(/Secret Song|Mystery Artist/);
    expect(newKeepNotificationTrackId(oldNotif as any)).toBe('33333333-3333-4333-8333-333333333333');
  });

  it('ajoute gratuitement via la RPC sécurisée et respecte Public/Privé', async () => {
    mockRpc.mockResolvedValueOnce({ data: { ok: true, deduplicated: false, charged: 0 }, error: null });
    const result = await keepFromNewKeepNotification(oldNotif as any, { id: '33333333-3333-4333-8333-333333333333' } as any, 'PUBLIC');
    expect(result).toEqual({ ok: true, alreadyKept: false });
    expect(mockRpc).toHaveBeenCalledWith('keep_commit_public_notification_keep', {
      p_notification_id: oldNotif.id,
      p_visibility: 'PUBLIC',
    });
  });

  it('garde le parcours vente protégé côté serveur', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'TRACK_SALE_PROTECTED' } });
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
    expect(component).toContain('Titre + artiste masqués jusqu’à l’ajout.');
    expect(component).toContain('revealedTrackLine(track)');
  });

  it('bannière et écran Notifications utilisent la même brique', () => {
    const banner = read('packages/mobile/src/components/GlobalNotificationBanner.tsx');
    const screen = read('packages/mobile/src/screens/NotificationsScreen.tsx');
    expect(banner).toContain('<NewKeepNotificationActions');
    expect(screen).toContain('<NewKeepNotificationActions');
    expect(banner).not.toContain("dataText(current, 'trackTitle')");
  });

  it('serveur : l’ajout gratuit exige une vraie notification du compte et refuse les morceaux en vente', () => {
    const sql = read('supabase/migrations/20261003031000_public_notification_free_keep.sql');
    expect(sql).toContain("and n.profile_id = v_uid");
    expect(sql).toContain("and upper(n.type) = 'NEW_PUBLIC_KEEP'");
    expect(sql).toContain('keep_playlist_sale_masked_track_ids');
    expect(sql).toContain("raise exception 'TRACK_SALE_PROTECTED'");
    expect(sql).toContain("'charged',0");
    expect(sql).toContain("'PUBLIC_NOTIFICATION_FREE'");
  });

  it('serveur : le fanout reste asynchrone et transmet l’empreinte du premier découvreur', () => {
    const sql = read('supabase/migrations/20261003030000_public_track_fanout_origin_scale.sql');
    expect(sql).toContain('public_track_notification_fanout_jobs');
    expect(sql).toContain("'sourceProfileId'");
    expect(sql).toContain('keep_process_public_track_notification_fanout(40, 2000)');
    expect(sql).not.toContain('for v_follower in');
  });
});
