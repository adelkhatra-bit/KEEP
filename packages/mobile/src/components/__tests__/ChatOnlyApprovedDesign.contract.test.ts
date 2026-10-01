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
    expect(panel).toContain("replyTarget ? replyTarget.username : 'Chat'");
    expect(panel).toContain("replyTarget\n                  ? 'Conversation privée'");
  });

  it('only shows the header action where it is useful', () => {
    expect(panel).toContain("chatMode === 'MESSAGES' && !replyTarget");
    expect(panel).toContain("accessibilityLabel={activeGroup ? 'Gérer les membres du groupe' : 'Créer une conversation'}");
    expect(panel).toContain("activeGroup ? '👥' : '＋'");
  });

  it('keeps the simple approved chat actions', () => {
    expect(panel).toContain('<Text style={s.drawerActionText}>RÉACTIONS</Text>');
    expect(panel).toContain('<Text style={s.drawerActionText}>MORCEAU</Text>');
    expect(panel).toContain('<Text style={s.drawerActionText}>QR PAYPAL</Text>');
    expect(panel).toContain('PARTAGER LE MORCEAU');
    expect(panel).toContain('placeholder="Rechercher une conversation…"');
  });
});
