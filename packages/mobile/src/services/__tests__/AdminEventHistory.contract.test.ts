import fs from 'fs';
import path from 'path';

describe('Super Admin event history', () => {
  const root = path.resolve(__dirname, '..', '..', '..', '..', '..');
  const api = fs.readFileSync(path.join(root, 'supabase/functions/keep-admin-control/index.ts'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'packages/admin/pages/moderation.tsx'), 'utf8');

  it('requires moderator role for read-only event history', () => {
    expect(api).toContain('action === "moderation.events_history"');
    expect(api).toContain('assertRole(actor, ["SUPER_ADMIN", "ADMIN", "MODERATOR"])');
    expect(api).toContain('.from("events")');
    expect(api).toContain('.limit(100)');
  });
  it('keeps pending moderation and also shows expired and approved events', () => {
    expect(page).toContain("moderation.events_pending");
    expect(page).toContain("moderation.events_history");
    expect(page).toContain("Historique des soirées");
    expect(page).toContain("TERMINÉE");
  });
});
