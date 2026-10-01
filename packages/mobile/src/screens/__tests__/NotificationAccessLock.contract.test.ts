import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('notification accordion and plan locks contract', () => {
  const panel = read(__dirname, '..', '..', 'components', 'NotificationSidePanel.tsx');
  const access = read(__dirname, '..', '..', 'services', 'notificationAccessService.ts');
  const admin = read(__dirname, '..', '..', '..', '..', 'admin', 'pages', 'messages.tsx');
  const contract = JSON.parse(read(__dirname, '..', '..', '..', '..', '..', 'config', 'keep-product-contract.json'));

  it('keeps bell notifications inline and accordion-based', () => {
    expect(panel).toContain('LayoutAnimation.Presets.easeInEaseOut');
    expect(panel).toContain('setExpandedId');
    expect(panel).toContain('Appuie sur une ligne pour la déplier');
    expect(panel).not.toContain('TOUT VOIR');
    expect(panel).toContain('Aucune redirection');
    expect(panel).not.toContain("sourceFeature: 'NOTIFICATION_ACCESS'");
  });

  it('lets Super Admin lock every live notification type by plan', () => {
    expect(admin).toContain('Cadenas des notifications');
    expect(admin).toContain("from('notification_access_rules')");
    expect(admin).toContain('PREMIUM');
    expect(admin).toContain('CREATOR_PRO');
    expect(admin).toContain('VENUE_PRO');
  });

  it('uses the same access rule in mobile surfaces', () => {
    expect(access).toContain('isNotificationAccessLocked');
    expect(access).toContain('notificationAccessRequiredPlan');
    expect(contract.notificationExperience.superAdminPlanLocks).toBe(true);
    expect(contract.notificationExperience.lockRuleTable).toBe('public.notification_access_rules');
  });
});
