// @ts-nocheck
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'GlobalChatDock.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('Global chat uses the real Supabase session', () => {
  it('hydrates and follows the authenticated profile independently of stale UI guest/demo state', () => {
    expect(source).toContain("import { supabase } from '../services/supabaseClient';");
    expect(source).toContain('supabase.auth.getSession()');
    expect(source).toContain('supabase.auth.onAuthStateChange');
    expect(source).toContain('const effectiveProfileId = supabase');
    expect(source).toContain('const accountReady = Boolean(effectiveProfileId);');
  });

  it('never closes an opened chat while auth is still hydrating', () => {
    expect(source).toContain('if (!authResolved && !previewOnly) return;');
    expect(source).toContain('if (!accountReady || !effectiveProfileId)');
  });

  it('uses the same real profile id for notifications and the messenger panel', () => {
    expect(source).toContain('loadNotifications(effectiveProfileId)');
    expect(source).toContain('subscribeToNotifications(effectiveProfileId');
    expect(source).toContain("currentProfileId={effectiveProfileId || user?.id || ''}");
  });
});
