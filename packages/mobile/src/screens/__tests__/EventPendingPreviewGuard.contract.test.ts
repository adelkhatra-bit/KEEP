// @ts-nocheck
import fs from 'fs';
import path from 'path';

const parties = fs.readFileSync(path.resolve(__dirname, '..', 'PartiesScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');
const service = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'creatorEventService.ts'), 'utf8').replace(/\r\n/g, '\n');
const migration = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261003030000_event_pending_preview_and_contact_guard.sql'), 'utf8');

describe('Soirées — aperçu PENDING sûr avant validation', () => {
  it('ne débloque aucune action sur un aperçu en validation', () => {
    expect(parties).toContain('isPendingPreview');
    expect(parties).toContain('EN COURS DE VALIDATION · APERÇU UNIQUEMENT');
    expect(parties).toContain("!isOwnEvent && !isPendingPreview");
    expect(parties).toContain("!isPendingPreview ? <TouchableOpacity style={styles.secondary}");
  });

  it('ne charge que la jaquette et un descriptif nettoyé pour le preview', () => {
    expect(service).toContain("supabase.rpc('keep_pending_event_teasers_for_me'");
    expect(service).toContain('description: row.description_preview');
    expect(service).toContain('organizerPhone: null');
    expect(service).toContain('externalTicketUrl: null');
    expect(service).toContain('pendingPreviewOnly: true');
  });

  it('masque les contacts et empêche une approbation avec coordonnées/liens', () => {
    expect(migration).toContain('keep_event_preview_sanitize');
    expect(migration).toContain('[contact masqué]');
    expect(migration).toContain('[lien masqué]');
    expect(migration).toContain('event_description_contact_forbidden');
    expect(migration).toContain('event_recommendation_sends');
  });
});
