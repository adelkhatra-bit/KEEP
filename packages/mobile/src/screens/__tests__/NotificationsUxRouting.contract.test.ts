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

  it('never leaves an informational notification as a dead end', () => {
    expect(notifications).toContain("return 'LIRE EN ENTIER'");
    expect(notifications).toContain('setGenericDetailItem(item)');
    expect(notifications).toContain('genericDetailItem.body');
  });

  it('offers one-tap actions for every major notification family and a profile action for music', () => {
    expect(notifications).toContain("return 'OUVRIR LE TCHAT'");
    expect(notifications).toContain("return 'VOIR MES FREE'");
    expect(notifications).toContain("return 'OUVRIR BATTLE'");
    expect(notifications).toContain("return 'OUVRIR LA COLLECTION'");
    expect(notifications).toContain("return 'VOIR LA PÉPITE'");
    expect(notifications).toContain("if (profileUsername || notificationProfileId(item)) return null;");
    expect(notifications).toContain('VOIR LE PROFIL · @{profileUsername}');
    expect(notifications).toContain("type === 'MONTHLY_FREE_CREDIT' || type.startsWith('FREE_')");
    expect(notifications).toContain('ownerProfileId');
  });

  it('routes native pushes to their exact in-app action using notification type and id', () => {
    const nav = fs.readFileSync(path.resolve(__dirname, '..', '..', 'navigation', 'navigationRef.ts'), 'utf8');
    const worker = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'functions', 'keep-push-worker', 'index.ts'), 'utf8');
    expect(worker).toContain('notificationId: notification.id');
    expect(worker).toContain('notificationType: notification.type');
    expect(nav).toContain("type === 'PROFILE_VIEW'");
    expect(nav).toContain('payload.viewerUsername ?? payload.viewer_username');
    expect(nav).toContain("type === 'NEW_PUBLIC_KEEP'");
    expect(nav).toContain('focusNotificationId');
    expect(notifications).toContain('route?.params?.focusNotificationId');
    expect(notifications).toContain('void openNotification(target)');
  });

  it('turns profile-visit activity into a direct visible profile link', () => {
    const panel = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'NotificationSidePanel.tsx'), 'utf8');
    expect(panel).toContain("type === 'PROFILE_VIEW'");
    expect(panel).toContain('VOIR LE PROFIL @');
    expect(panel).toContain('accessibilityRole="link"');
    expect(panel).toContain('openActivityProfile(item)');
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

  it('makes profile activity directly clickable from the global banner too', () => {
    const banner = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'GlobalNotificationBanner.tsx'), 'utf8');
    expect(banner).toContain('profileUsernameForNotification');
    expect(banner).toContain('openProfileFromNotification');
    expect(banner).toContain("profileUsername ? 'voir le profil' : 'toucher = lu'");
  });

  it('keeps direct one-click actions for Battle and the profile notification panel', () => {
    expect(notifications).not.toContain('isSellerPaymentAction(item) || isBattleInvite(item)) return null');
    const panel = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'NotificationSidePanel.tsx'), 'utf8');
    expect(panel).toContain('resolveActivityProfileUsername');
    expect(panel).toContain('<NewKeepNotificationActions');
    expect(panel).toContain("onOpenProfile={() => { void openActivityProfile(item); }}");
    expect(panel).toContain('activityActionLabel(item)');
  });

  it('blocks PayPal checkout on native notification surfaces', () => {
    const sidePanel = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'NotificationSidePanel.tsx'), 'utf8');
    expect(notifications).toContain("if (Platform.OS !== 'web')");
    expect(notifications).toContain('Le déblocage en euros est disponible sur la version web de Loki Music');
    expect(sidePanel).toContain("if (Platform.OS !== 'web')");
    expect(sidePanel).toContain('Le déblocage en euros est disponible sur la version web de Loki Music');
  });

  it('renders PayPal QR from payment data as an image instead of a technical token', () => {
    expect(notifications).toContain('item.data?.payoutQrUrl');
    expect(notifications).toContain('item.data?.payout_qr_url');
    expect(notifications).toContain('notificationImageUrl');
  });

  it('keeps subscribe-only behavior in both notification surfaces', () => {
    const sidePanel = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'NotificationSidePanel.tsx'), 'utf8');
    expect(notifications).toContain("supabase.rpc('keep_follow_profile'");
    expect(sidePanel).toContain("supabase.rpc('keep_follow_profile'");
    expect(notifications).not.toContain("keep_unfollow_profile");
    expect(sidePanel).not.toContain("keep_unfollow_profile");
  });

  it('keeps the compact profile notification panel actionable too', () => {
    const sidePanel = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'NotificationSidePanel.tsx'), 'utf8');
    expect(sidePanel).toContain('<NewKeepNotificationActions');
    expect(sidePanel).toContain("return 'VOIR MES FREE'");
    expect(sidePanel).toContain("return 'OUVRIR BATTLE'");
    expect(sidePanel).toContain("return 'VOIR LE PROFIL'");
    expect(sidePanel).toContain('openActivityNotification');
  });

  it('shows the visited username directly in profile-activity actions', () => {
    expect(notifications).toContain("if (key === 'PROFILE_VIEW') return 'VISITE DE PROFIL'");
    expect(notifications).toContain('profileUsername ? <Text style={styles.cardProfileLink}>Actions avec @{profileUsername} ›</Text> : null');
    const sidePanel = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'NotificationSidePanel.tsx'), 'utf8');
    expect(sidePanel).toContain('return `VOIR @${profileUsername}`');
  });
});
