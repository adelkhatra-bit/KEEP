// @ts-nocheck
import fs from 'fs';
import path from 'path';

const mockCommitKeep = jest.fn();
jest.mock('../keepTrackAction', () => ({ commitKeep: (...args) => mockCommitKeep(...args) }));
jest.mock('../musicAgoraService', () => ({ loadMusicAgoraSharedTrack: jest.fn() }));
jest.mock('../connectedMusicLibrary', () => ({ checkOwnKeepLibrary: jest.fn() }));
jest.mock('../lokiPulseKeep', () => ({ lokiPulseKeepErrorMessage: (m, c) => (m.includes('CREDITS_EXHAUSTED') ? `Il te faut ${c} FREE` : 'erreur') }));

import { isNewKeepNotification, maskedNewKeepCopy, keepFromNewKeepNotification, newKeepNotificationTrackId } from '../newKeepNotification';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
const read = (...p) => fs.readFileSync(path.resolve(repoRoot, ...p), 'utf8');

// Ancienne notification : titre/artiste en clair dans le texte et data.
const oldNotif = {
  id: 'n1', type: 'NEW_PUBLIC_KEEP', title: 'Nouveau KEEP de @adel', body: 'Secret Song — Mystery Artist · ajouté à son profil.',
  data: { ownerProfileId: 'owner-1', username: 'adel', trackId: 'track-1', trackTitle: 'Secret Song', trackArtist: 'Mystery Artist', artworkUrl: 'http://x/a.jpg' },
  readAt: null, createdAt: '2026-10-02T00:00:00Z',
};

describe('Notification « nouveau morceau » masquée (Adel 02/10/2026)', () => {
  it('ne révèle jamais titre ni artiste, même pour une ancienne notification', () => {
    const copy = maskedNewKeepCopy(oldNotif);
    expect(isNewKeepNotification(oldNotif)).toBe(true);
    expect(copy.title).toBe('Nouveau morceau chez @adel');
    expect(`${copy.title} ${copy.body}`).not.toMatch(/Secret|Mystery/);
    expect(newKeepNotificationTrackId(oldNotif)).toBe('track-1');
  });

  it('GARDER passe par le chemin unique (débit FREE serveur, provenance sociale)', async () => {
    mockCommitKeep.mockResolvedValueOnce({ alreadyKept: false });
    const res = await keepFromNewKeepNotification(oldNotif, { id: 'track-1' }, 'PUBLIC', 3);
    expect(res).toEqual({ ok: true, alreadyKept: false });
    const [, , , options] = mockCommitKeep.mock.calls[0];
    expect(options.consumeCredit).toBe(true);
    expect(options.visibility).toBe('PUBLIC');
    expect(options.context.sourceProfileId).toBe('owner-1');
  });

  it('message clair quand les FREE manquent', async () => {
    mockCommitKeep.mockRejectedValueOnce(new Error('CREDITS_EXHAUSTED'));
    const res = await keepFromNewKeepNotification(oldNotif, { id: 'track-1' }, 'PRIVATE', 3);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('3 FREE');
  });

  it('bannière et écran Notifications utilisent la même brique, sans pochette ni titre', () => {
    const banner = read('packages/mobile/src/components/GlobalNotificationBanner.tsx');
    const screen = read('packages/mobile/src/screens/NotificationsScreen.tsx');
    expect(banner).toContain('<NewKeepNotificationActions');
    expect(screen).toContain('<NewKeepNotificationActions');
    expect(banner).not.toContain("dataText(current, 'trackTitle')");
    const component = read('packages/mobile/src/components/NewKeepNotificationActions.tsx');
    expect(component).toContain('playAntiShazamPreviewSegment');
    expect(component).not.toContain('<Image');
  });

  it('serveur : la notification (et le push) ne contient plus titre, artiste ni pochette', () => {
    const sql = read('supabase/migrations/20261003008000_new_keep_notification_masked.sql');
    expect(sql).toContain("'Nouveau morceau chez @'");
    expect(sql).not.toMatch(/'trackTitle'|'trackArtist'|'artworkUrl'|v_title|v_artist/);
    expect(sql).toContain("'trackId', new.track_id");
  });
});
