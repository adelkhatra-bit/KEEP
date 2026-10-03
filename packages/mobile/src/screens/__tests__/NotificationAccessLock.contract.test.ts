import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('notification accordion and plan locks contract', () => {
  const panel = read(__dirname, '..', '..', 'components', 'NotificationSidePanel.tsx');
  const access = read(__dirname, '..', '..', 'services', 'notificationAccessService.ts');
  const admin = read(__dirname, '..', '..', '..', '..', 'admin', 'pages', 'notification-access.tsx');
  const ownerProfile = read(__dirname, '..', 'ProfilePublicScreen.tsx');
  const contract = JSON.parse(read(__dirname, '..', '..', '..', '..', '..', 'config', 'keep-product-contract.json'));

  it('keeps bell notifications inline and accordion-based', () => {
    expect(panel).toContain('LayoutAnimation.Presets.easeInEaseOut');
    expect(panel).toContain('setExpandedId');
    expect(panel).toContain("Appuie pour ouvrir. Utilise × pour supprimer ce qui ne t’est plus utile.");
    expect(panel).not.toContain('TOUT VOIR');
    expect(panel).toContain('Pourquoi cette notification est verrouillée');
    expect(panel).toContain('Son contenu reste masqué tant qu’elle n’est pas débloquée.');
    expect(panel).not.toContain('lockedPopup.title');
    expect(panel).toContain("Tu restes dans tes notifications.");
    expect(panel).toContain("activeTab === 'MESSAGES'");
    expect(panel).toContain("activeTab === 'ACTIVITY'");
    expect(panel).toContain("activeTab === 'SETTINGS'");
    expect(panel).not.toContain("sourceFeature: 'NOTIFICATION_ACCESS'");
    expect(panel).toContain("useGlobalChatStore.getState().open(target)");
    expect(panel).toContain('OUVRIR LA CONVERSATION');
    expect(ownerProfile).toContain('setNotificationPanelOpen(true)');
    expect(ownerProfile).not.toContain("onOpenAll={() => navigation.navigate('Notifications')}");
  });

  it('lets Super Admin lock every live notification type by plan', () => {
    expect(admin).toContain('Accès aux notifications');
    expect(admin).toContain("from('notification_access_rules')");
    expect(admin).toContain('PREMIUM');
    expect(admin).toContain('CREATOR_PRO');
    expect(admin).toContain('VENUE_PRO');
  });

  it('lets every paid formula control promotional notification noise', () => {
    const notifications = read(__dirname, '..', 'NotificationsScreen.tsx');
    expect(notifications).toContain("['PREMIUM', 'CREATOR_PRO', 'VENUE_PRO'].includes(planCode)");
    expect(notifications).toContain('const marketingLocked = !paidNotificationControls;');
    expect(notifications).toContain('const eventsLocked = !paidNotificationControls;');
  });

  it('never paywalls the right to disable promotional notifications', () => {
    expect(notifications).not.toContain('const marketingLocked =');
    expect(notifications).not.toContain('const eventsLocked =');
    expect(notifications).toContain('label="Actualités & offres"');
    expect(notifications).toContain('value={prefs.marketingEnabled}');
    expect(notificationService).toContain('marketingEnabled: false');
  });

  it('uses the same access rule in mobile surfaces', () => {
    expect(access).toContain('isNotificationAccessLocked');
    expect(access).toContain('notificationAccessRequiredPlan');
    expect(contract.notificationExperience.superAdminPlanLocks).toBe(true);
    expect(contract.notificationExperience.lockRuleTable).toBe('public.notification_access_rules');
  });
});
