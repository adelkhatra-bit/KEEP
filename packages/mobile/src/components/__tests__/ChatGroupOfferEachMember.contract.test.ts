import fs from 'fs';
import path from 'path';

// Adel (02/10/2026) : vendre en FREE / € dans un groupe = offre privée à
// chaque membre actif (circuit de paiement existant). Plus de refus en groupe.
const panel = fs.readFileSync(path.join(__dirname, '..', 'MusicAgoraPanel.tsx'), 'utf8');
const service = fs.readFileSync(path.join(__dirname, '..', '..', 'services', 'musicAgoraService.ts'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261002231500_agora_group_offer_each_member.sql'), 'utf8');

describe('group sale = one private offer per member', () => {
  it('sends paid group shares through keep_agora_post_group_offer', () => {
    expect(service).toContain("supabase.rpc('keep_agora_post_group_offer'");
    expect(panel).toContain("if (activeGroup?.id && sharedTrack && sharePaymentMode !== 'NONE') {");
    expect(panel).not.toContain('une demande de FREE ou de paiement doit être envoyée dans une conversation directe');
  });

  it('reuses the existing private offer + payment circuit for every active member', () => {
    expect(migration).toContain("public.keep_agora_post_message_v4(");
    expect(migration).toContain("m.status='ACTIVE' and m.profile_id<>v_uid");
    expect(migration).toContain("RECIPIENT_ALREADY_OWNS_TRACK");
  });

  it('enlarges the green share panel only while options are open', () => {
    expect(panel).toContain('shareOptionsOpen && { maxHeight: shareExpandedHeight }');
  });
});
