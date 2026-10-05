import fs from 'fs';
import path from 'path';
const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');

describe('Chat : présence verte/rouge + Vu / En attente (Adel 05/10/2026)', () => {
  const panel = read('components', 'MusicAgoraPanel.tsx');
  const svc = read('services', 'musicAgoraService.ts');
  it('pastille de présence dans la liste des conversations et dans l\'en-tête du fil', () => {
    expect(panel).toContain('chat-presence-');
    expect(panel).toContain('testID="chat-thread-presence"');
    expect(panel).toContain("loadProfilePresence");
    expect(panel).toContain('presenceOn');
    expect(panel).toContain('presenceOff');
  });
  it('présence inconnue = aucune pastille (jamais un faux « hors ligne »)', () => {
    expect(panel).toContain('presenceByProfile[item.profileId] !== undefined');
  });
  it('accusé de lecture : marqué à l\'ouverture, « Vu » ou « En attente » sous mon dernier message', () => {
    expect(svc).toContain("rpc('keep_agora_mark_direct_read'");
    expect(svc).toContain("from('music_agora_direct_reads')");
    expect(panel).toContain('testID="chat-read-receipt"');
    expect(panel).toContain("'✓✓ Vu' : '⏳ En attente'");
  });
  it('le sondage de présence reste >= 5 s (règle anti-saturation)', () => {
    expect(panel).toMatch(/setInterval\(\(\) => \{ void load\(\); \}, 30000\)/);
  });
  it('migration additive de l\'accusé de lecture', () => {
    const mig = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261005250000_agora_direct_reads.sql'), 'utf8');
    expect(mig).toContain('music_agora_direct_reads');
    expect(mig).not.toMatch(/drop table|delete from/i);
  });
});

describe('Aperçu propriétaire : musique en vente masquée avec l\'animation (Adel 05/10/2026)', () => {
  const deck = read('components', 'MusicSwipeDeckModal.tsx');
  it('une musique de ma boutique est masquée dans l\'aperçu, avec la pochette mystère animée', () => {
    expect(deck).toContain('const ownerMasked = Boolean(previewOnly && currentOffered');
    expect(deck).toContain('{ownerMasked ? <View style={[s.cover,s.coverFallback]}><MysteryArtwork');
  });
  it('les cartes sale: gardent la pochette mystère', () => {
    expect(deck).toContain("isSaleStoryTrack(current) ? <MysteryArtwork caption=\"Titre masqué · garde pour révéler\"");
  });
});
