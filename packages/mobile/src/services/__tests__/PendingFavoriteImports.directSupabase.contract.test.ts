import fs from 'fs';
import path from 'path';

describe('Pending favorite imports', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'musicProviderSyncService.ts'), 'utf8');

  it('uses authenticated Supabase RLS instead of the optional Vercel backend', () => {
    const start = source.indexOf('export async function loadPendingFavoriteImports');
    const end = source.indexOf('export async function loadImportedMusic', start);
    const block = source.slice(start, end);
    expect(block).toContain("from('music_library_items')");
    expect(block).toContain(".eq('profile_id', profileId)");
    expect(block).toContain(".eq('pending_review', true)");
    expect(block).not.toContain('/api/music/library/pending-session-imports');
  });
});
