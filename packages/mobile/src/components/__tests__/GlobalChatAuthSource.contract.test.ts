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
    expect(source).toContain('lastAuthenticatedProfileIdRef.current');
    expect(source).toContain('const effectiveProfileId = authenticatedProfileId || lastAuthenticatedProfileIdRef.current || storeProfileId;');
    expect(source).toContain('const accountReady = Boolean(effectiveProfileId);');
  });

  it('never closes an opened chat while auth is still hydrating or briefly null', () => {
    expect(source).toContain('if (!authResolved && !previewOnly) return;');
    expect(source).toContain("if (event === 'SIGNED_OUT')");
    expect(source).toContain('if (!accountReady || !effectiveProfileId)');
    const authGapBlock = source.slice(
      source.indexOf('if (!accountReady || !effectiveProfileId)'),
      source.indexOf('let live = true;', source.indexOf('if (!accountReady || !effectiveProfileId)')),
    );
    expect(authGapBlock).not.toContain('closeChat();');
  });

  it('uses the same real profile id for notifications and the messenger panel', () => {
    expect(source).toContain("loadNotifications(effectiveProfileId, { dedupe: false, unreadOnly: true })");
    expect(source).toContain('subscribeToNotifications(effectiveProfileId');
    expect(source).toContain("currentProfileId={effectiveProfileId || user?.id || ''}");
  });
});
