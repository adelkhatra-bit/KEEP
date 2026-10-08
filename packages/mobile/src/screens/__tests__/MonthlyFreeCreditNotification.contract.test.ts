import fs from 'fs';
import path from 'path';

describe('Monthly Free credit notification contract', () => {
  const notifications = fs.readFileSync(path.resolve(__dirname, '..', 'NotificationsScreen.tsx'), 'utf8');
  const migration = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261001002500_monthly_free_credit_notifications.sql'), 'utf8');
  const onceMigration = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261003010000_monthly_free_notification_once.sql'), 'utf8');

  it('shows a friendly dedicated label in the notification center', () => {
    expect(notifications).toContain("if (key === 'MONTHLY_FREE_CREDIT') return 'FREE DU MOIS';");
  });

  it('notifies each credited profile once per credited month', () => {
    expect(migration).toContain("'MONTHLY_FREE_CREDIT'");
    expect(migration).toContain("n.data ->> 'creditMonth' = award.credit_month::text");
    expect(migration).toContain("award.amount > 0");
  });

  it('does not recreate a monthly notification on a later day', () => {
    expect(onceMigration).toContain("(award.created_at at time zone 'UTC')::date = (p_as_of at time zone 'UTC')::date");
    expect(onceMigration).toContain("and (n.created_at at time zone 'UTC')::date > (award.created_at at time zone 'UTC')::date");
  });

  it('keeps the user-facing message tied to the real credited amount', () => {
    expect(migration).toContain('la plateforme Loki Music vient de créditer +%s Free');
    expect(migration).toContain('garde ce qui te ressemble');
  });
});
