import fs from 'fs';
import path from 'path';
import { isMessageHiddenByPrefs, EPHEMERAL_MESSAGE_HOURS } from '../conversationPrefs';
const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');

describe('Messages éphémères / effacer la conversation (Adel 05/10/2026)', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  it('sans réglage, rien n\'est masqué', () => {
    expect(isMessageHiddenByPrefs(undefined, '2026-01-01T00:00:00Z', now)).toBe(false);
    expect(isMessageHiddenByPrefs({ ephemeral: false, clearedAt: null }, '2026-01-01T00:00:00Z', now)).toBe(false);
  });
  it('éphémère : masque ce qui a plus de 24 h, garde le récent', () => {
    const prefs = { ephemeral: true, clearedAt: null };
    expect(EPHEMERAL_MESSAGE_HOURS).toBe(24);
    expect(isMessageHiddenByPrefs(prefs, '2026-10-04T11:59:00Z', now)).toBe(true);
    expect(isMessageHiddenByPrefs(prefs, '2026-10-05T01:00:00Z', now)).toBe(false);
  });
  it('effacée : masque tout jusqu\'à l\'horodatage, pas les nouveaux messages', () => {
    const prefs = { ephemeral: false, clearedAt: '2026-10-05T10:00:00Z' };
    expect(isMessageHiddenByPrefs(prefs, '2026-10-05T09:59:59Z', now)).toBe(true);
    expect(isMessageHiddenByPrefs(prefs, '2026-10-05T10:00:01Z', now)).toBe(false);
  });
  it('les messages privés et groupes sont filtrés, jamais le salon public', () => {
    const svc = read('services', 'musicAgoraService.ts');
    expect(svc).toContain('directConversationKey(otherProfileId)');
    expect(svc).toContain('groupConversationKey(groupId)');
    expect(svc).not.toMatch(/loadMusicAgoraMessages[\s\S]{0,1500}isMessageHiddenByPrefs/);
    expect(svc).toContain("rpc('keep_agora_clear_conversation'");
  });
  it('options accessibles dans la conversation (compact et plein écran) avec les deux actions', () => {
    const panel = read('components', 'MusicAgoraPanel.tsx');
    expect(panel).toContain('testID="chat-options"');
    expect(panel).toContain('testID="chat-options-full"');
    expect(panel).toContain('Activer les messages éphémères (24 h)');
    expect(panel).toContain('Effacer la conversation (pour moi)');
  });
  it('une vente du chat dure 24 h : prévenu à l\'envoi, carte « expirée », profil sans historique', () => {
    const panel = read('components', 'MusicAgoraPanel.tsx');
    expect(panel).toContain('chat-sale-24h-note');
    expect(panel).toContain('chat-offer-expired');
    expect(read('screens', 'ProfilePublicScreen.tsx')).toContain("offer.isActive && offer.playlistId.startsWith('keep-chat:')");
    const mig = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261005230000_chat_ephemeral_prefs.sql'), 'utf8');
    expect(mig).toContain("interval '24 hours'");
    expect(mig).toContain('keep_expire_chat_sale_offers');
  });
});
