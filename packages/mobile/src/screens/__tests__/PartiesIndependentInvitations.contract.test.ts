// @ts-nocheck
import fs from 'fs';
import path from 'path';

const parties = fs.readFileSync(path.resolve(__dirname, '..', 'PartiesScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');
const service = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'creatorEventService.ts'), 'utf8').replace(/\r\n/g, '\n');
const migration = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261003029000_event_invitations_independent.sql'), 'utf8');

describe('Soirées — annonces déposées et invitations reçues indépendantes', () => {
  it('ouvre deux vues réellement distinctes depuis l’accueil Soirées', () => {
    expect(parties).toContain("setEventViewMode('MY')");
    expect(parties).toContain("setEventViewMode('INVITES')");
    expect(parties).toContain("eventViewMode === 'MY'");
    expect(parties).toContain("eventViewMode === 'INVITES'");
    expect(parties).toContain('INVITATIONS REÇUES');
  });

  it('identifie les invitations par la diffusion serveur dédupliquée', () => {
    expect(service).toContain("supabase.rpc('keep_my_event_invitation_ids')");
    expect(migration).toContain('event_recommendation_sends');
    expect(migration).toContain('s.profile_id = auth.uid()');
    expect(migration).toContain("e.moderation_status = 'APPROVED'");
  });

  it('conserve les événements du créateur visibles pendant la validation', () => {
    expect(parties).toContain("'Les événements que tu crées apparaissent ici, y compris pendant leur validation.'");
  });
});
