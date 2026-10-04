// @ts-nocheck
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'PublicUserProfileScreen.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('PublicUserProfileScreen real-session + inline event contract', () => {
  it('heals stale guest/demo state from the real Supabase session', () => {
    expect(source).toContain("import { createAuthService } from '../services/authService';");
    expect(source).toContain('auth.getCurrentSession()');
    expect(source).toContain('auth.onSessionChange');
    expect(source).toContain('state.syncFromAuthSession(session)');
    expect(source).toContain('const effectiveViewerId = authenticatedViewerId');
  });

  it('uses the effective authenticated viewer for account-gated profile actions', () => {
    expect(source).not.toContain('!viewer || isLocalGuest');
    expect(source).not.toContain('!viewer?.id || isLocalGuest');
    expect(source).not.toContain('requiresAccount={!viewer || isLocalGuest}');
    expect(source).toContain('requiresAccount={!effectiveViewerId && !isDemoMode}');
    expect(source).toContain('const chooseProfileEventRsvp = async (status: EventRsvpStatus) =>');
    expect(source).toContain('await setEventRsvp(effectiveViewerId, profileEvent.id, status);');
  });

  it('keeps profile events inline and never redirects to Parties', () => {
    expect(source).toContain('openProfileEventInline');
    expect(source).toContain('onPress={() => { void openProfileEventInline(); }}');
    expect(source).toContain('EN ATTENTE D’APPROBATION');
    expect(source).toContain("['GOING', 'JE PARTICIPE']");
    expect(source).toContain("['MAYBE', 'PEUT-ÊTRE']");
    expect(source).toContain("['NOT_GOING', 'JE NE PARTICIPE PAS']");
    expect(source).toContain("{selected ? '✓ ' : ''}{label}");
    expect(source).not.toContain("navigation.navigate('Parties', { openEventId");
  });
});
