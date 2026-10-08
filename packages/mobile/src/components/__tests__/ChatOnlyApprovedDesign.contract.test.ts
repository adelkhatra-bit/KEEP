// @ts-nocheck
import fs from 'fs';
import path from 'path';

const panel = fs.readFileSync(
  path.resolve(__dirname, '..', 'MusicAgoraPanel.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('Loki chat-only approved design contract', () => {
  it('keeps the mobile messenger focused on chat, without call or camera controls', () => {
    for (const forbidden of ['📞','📹','🎥','APPEL AUDIO','APPEL VIDÉO','CAMÉRA','Appeler','tel:']) {
      expect(panel).not.toContain(forbidden);
    }
    expect(panel).toContain("replyTarget ? replyTarget.username : chatMode === 'PLACE' ? 'La Place' : 'Chat'");
    expect(panel).toContain('presenceByProfile[replyTarget.profileId] !== undefined');
    expect(panel).toContain('formatProfilePresence(lastSeenByProfile[replyTarget.profileId] ?? null, Boolean(presenceByProfile[replyTarget.profileId]))');
    expect(panel).toContain(": 'Conversation privée'");
  });

  it('only shows the header action where it is useful', () => {
    expect(panel).toContain("chatMode === 'MESSAGES' && !replyTarget && !activeGroup");
    expect(panel).toContain('accessibilityLabel="Gérer les membres du groupe"');
    expect(panel).toContain('accessibilityLabel="Créer une conversation"');
    expect(panel).toContain('<Text style={s.compactHeaderActionText}>👥</Text>');
    expect(panel).toContain('<Text style={s.compactHeaderActionText}>＋</Text>');
  });

  it('keeps the simple approved chat actions', () => {
    expect(panel).toContain('<Text style={[s.drawerActionText, s.drawerActionReactionsText]}>RÉACTIONS</Text>');
    expect(panel).toContain('<Text style={[s.drawerActionText, s.drawerActionMusicText]}>MORCEAU</Text>');
    expect(panel).toContain('<Text style={s.qrMessageTitle}>QR PAYPAL · @{message.username}</Text>');
    expect(panel).toContain('PARTAGER LE MORCEAU');
    expect(panel).toContain('placeholder="Rechercher une conversation…"');
  });
});
