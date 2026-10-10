// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Profile notifications drawer + sale origin guard', () => {
  const profile = read(__dirname, '..', 'ProfilePublicScreen.tsx');
  const notificationPanel = read(__dirname, '..', '..', 'components', 'NotificationSidePanel.tsx');
  const myMusic = read(__dirname, '..', 'MyMusicScreen.tsx');
  const migration = read(
    __dirname, '..', '..', '..', '..', '..',
    'supabase', 'migrations', '20261001205500_playlist_sale_origin_guard.sql',
  );

  it('opens notifications in a side drawer instead of navigating away on bell tap', () => {
    expect(profile).toContain("import NotificationSidePanel from '../components/NotificationSidePanel';");
    expect(profile).toContain('setNotificationPanelOpen(true)');
    expect(profile).toContain('visible={notificationPanelOpen}');
    const bellBlock = profile.slice(profile.indexOf('style={s.iconButton}'), profile.indexOf('style={s.iconButton}') + 900);
    expect(bellBlock).not.toContain("navigation.navigate('Notifications')");
  });

  it('shows an explicit direct profile link inside activity notifications', () => {
    expect(notificationPanel).toContain('linkedProfileUsername');
    expect(notificationPanel).toContain('hasLinkedProfile');
    expect(notificationPanel).toContain('Voir @${linkedProfileUsername} ›');
    expect(notificationPanel).toContain('void openActivityProfile(item)');
    expect(notificationPanel).toContain('activityProfileUsername(item)');
    expect(notificationPanel).toContain('data.viewerUsername ?? data.viewer_username');
  });

  it('keeps chat out of the hamburger and accessible from the bell message tab', () => {
    expect(profile).not.toContain("title: 'TCHAT'");
    expect(notificationPanel).toContain("activeTab === 'MESSAGES'");
    expect(notificationPanel).toContain('OUVRIR LA CONVERSATION');
    expect(notificationPanel).toContain('useGlobalChatStore');
  });

  it('opens the exact chat target from an AGORA notification and keeps the nudge visible longer', () => {
    expect(notificationPanel).toContain("value.startsWith('AGORA')");
    expect(notificationPanel).toContain('roomSlug');
    expect(notificationPanel).toContain('targetProfileId');
    expect(notificationPanel).toContain('targetUsername');
    expect(notificationPanel).toContain('messageId');
    expect(notificationPanel).toContain('useGlobalChatStore.getState().open(chatTarget(item))');
    expect(profile).toContain('}, 7000);');
  });

  it('opens primary hamburger destinations in one tap', () => {
    const start = profile.indexOf('const directMenuAction');
    const block = profile.slice(start, start + 1800);
    expect(block).toContain("if (key === 'profile') { openFromMenu('ProfileSettings'); return; }");
    expect(block).toContain("if (key === 'music') { openFromMenu('MusicConnections'); return; }");
    expect(block).toContain("if (key === 'offers') { openFromMenu('Offers'); return; }");
    expect(block).toContain("if (key === 'sellPlaylists') { openFromMenu('PlaylistSale'); return; }");
    expect(block).toContain("if (key === 'receipts') { openFromMenu('PlaylistSale', { openPaymentHistory: true }); return; }");
  });

  it('keeps transaction receipts reachable from the profile hamburger', () => {
    expect(profile).toContain("key: 'receipts'");
    expect(profile).toContain('Reçus & transactions');
    expect(profile).toContain("openFromMenu('PlaylistSale', { openPaymentHistory: true })");
  });

  it('shows social tracks as share-only and visibly locked for resale', () => {
    expect(myMusic).toContain('🔒 PARTAGE SEUL');
    expect(myMusic).toContain('Partage autorisé · vente FREE/€ bloquée');
    expect(myMusic).toContain('const notOwnDiscovery = Boolean(localEntry?.sourceProfileId);');
  });

  it('blocks social-origin tracks at the database boundary for every sale path', () => {
    expect(migration).toContain('trg_guard_playlist_sale_track_origin');
    expect(migration).toContain("raise exception 'TRACK_NOT_OWN_DISCOVERY'");
    expect(migration).toContain('kd.source_user_id is not null');
    expect(migration).toContain("coalesce(kd.context->>'creditPolicy','')='SOCIAL_ZERO_CREDIT'");
  });
});
