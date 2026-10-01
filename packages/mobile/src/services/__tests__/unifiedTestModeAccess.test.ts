// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');

describe('Unified test mode access', () => {
  const migration = read(
    repoRoot,
    'supabase',
    'migrations',
    '20261001173000_unified_test_mode_access.sql',
  );

  it('marks test mode centrally on profiles instead of relying on one-off user bypasses', () => {
    expect(migration).toContain('add column if not exists test_mode_enabled boolean not null default false');
    expect(migration).toContain('update public.profiles p');
    expect(migration).toContain('where p.follower_count_override is not null');
  });

  it('allows only flags explicitly approved for central test bypass', () => {
    expect(migration).toContain('add column if not exists test_bypass_allowed boolean not null default false');
    expect(migration).toContain("where key='playlist_marketplace'");
    expect(migration).toContain('if v_test_mode and v_test_bypass_allowed then');
  });

  it('automatically enters test mode when the Super Admin sets a follower override', () => {
    expect(migration).toContain('test_mode_enabled=(p_override is not null)');
  });

  it('keeps production accounts gated by the real global flag', () => {
    expect(migration).toContain('if v_global is true and v_rollout > 0 then');
    expect(migration).toContain('if uid is null then');
    expect(migration).toContain('return false;');
  });
});
