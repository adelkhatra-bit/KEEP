import fs from 'fs';
import path from 'path';

describe('Notifications UX and routing contract', () => {
  const notifications = fs.readFileSync(path.resolve(__dirname, '..', 'NotificationsScreen.tsx'), 'utf8');
  const profile = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8');
  const publicPanel = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'PublicProfilePanel.tsx'), 'utf8');
  const myMusic = fs.readFileSync(path.resolve(__dirname, '..', 'MyMusicScreen.tsx'), 'utf8');

  it('moves profile visibility to the top of notifications', () => {
    expect(notifications).toContain('CONFIDENTIALITÉ DU PROFIL');
    expect(notifications).toContain('updateProfileVisibility');
    expect(publicPanel).not.toContain('Profil visible');
  });

  it('animates the bell gently and shows an elongated temporary count nudge', () => {
    expect(profile).toContain('notificationBellShake');
    expect(profile).toContain('notificationNudgeVisible');
    expect(profile).toContain('notificationNudgeReveal');
    expect(profile).toContain('ouvre ta cloche');
    expect(profile).toContain('outputRange: [54, 222]');
  });

  it('marks notifications read after the user opens the center', () => {
    expect(notifications).toContain('markAllNotificationsRead(user.id)');
    expect(notifications).toContain('}, 900)');
  });

  it('routes monthly Free and delivered purchases to their real destinations', () => {
    expect(notifications).toContain("type === 'MONTHLY_FREE_CREDIT'");
    expect(notifications).toContain("sourceFeature: 'PROFILE_FREE'");
    expect(notifications).toContain("type === 'PLAYLIST_SALE_DELIVERED'");
    expect(notifications).toContain('openPurchasePlaylistId');
    expect(myMusic).toContain('openPurchasedCollection(entry)');
  });

  it('offers one-tap actions for every major notification family and a profile action for music', () => {
    expect(notifications).toContain("return 'OUVRIR LE TCHAT'");
    expect(notifications).toContain("return 'VOIR MES FREE'");
    expect(notifications).toContain("return 'OUVRIR BATTLE'");
    expect(notifications).toContain("return 'OUVRIR LA COLLECTION'");
    expect(notifications).toContain("return 'VOIR LA PÉPITE'");
    expect(notifications).toContain("return 'VOIR LE PROFIL'");
    expect(notifications).toContain("type === 'MONTHLY_FREE_CREDIT' || type.startsWith('FREE_')");
    expect(notifications).toContain('ownerProfileId');
  });

  it('routes group notifications to the exact group instead of opening a direct chat', () => {
    expect(notifications).toContain('const groupIdRaw = data?.groupId ?? data?.group_id;');
    expect(notifications).toContain('groupId,');
    expect(notifications).toContain('targetProfileId: groupId ? null');
  });

  it('resolves old social notifications even when only a profile id exists', () => {
    expect(notifications).toContain('notificationProfileId');
    expect(notifications).toContain('resolveNotificationProfileUsername');
  });

  it('keeps the compact profile notification panel actionable too', () => {
    const sidePanel = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'NotificationSidePanel.tsx'), 'utf8');
    expect(sidePanel).toContain('<NewKeepNotificationActions');
    expect(sidePanel).toContain("return 'VOIR MES FREE'");
    expect(sidePanel).toContain("return 'OUVRIR BATTLE'");
    expect(sidePanel).toContain("return 'VOIR LE PROFIL'");
    expect(sidePanel).toContain('openActivityNotification');
  });
});
