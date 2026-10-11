// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('chat music ownership and resale contract', () => {
  const panel = read(__dirname, '..', '..', 'components', 'MusicAgoraPanel.tsx');
  const dock = read(__dirname, '..', '..', 'components', 'GlobalChatDock.tsx');
  const service = read(__dirname, '..', '..', 'services', 'musicAgoraService.ts');

  it('allows sharing while blocking FREE and money resale for acquired tracks', () => {
    expect(panel).toContain('Partage oui · revente non');
    expect(panel).toContain('🔒 PARTAGE UNIQUEMENT · vente FREE/€ bloquée');
    expect(panel).toContain("'🔒 FREE'");
    expect(panel).toContain("'🔒 €'");
    expect(panel).toContain("accessibilityLabel={paymentLocked ? 'FREE verrouillé, afficher pourquoi' : 'Utiliser FREE'}");
  });

  it('shows the lock and source to both sides of the chat', () => {
    expect(panel).toContain('!message.senderCanResell');
    expect(panel).toContain('🔒 PARTAGE UNIQUEMENT · revente bloquée');
    expect(panel).toContain('Découverte par @');
    expect(panel).toContain('mise à l’écoute par @');
    expect(panel).toContain('source @');
  });

  it('keeps ownership metadata when opening the share picker', () => {
    expect(dock).toContain('canSell: row.canSell');
    expect(dock).toContain('sourceUsername: row.sourceUsername');
    expect(panel).toContain('track.canSell === false');
    expect(panel).toContain('🔒 partage uniquement');
  });

  it('uses server ownership preflight and server-enforced posting', () => {
    expect(service).toContain('keep_agora_share_preflight');
    expect(service).toContain('senderCanResell');
    expect(service).toContain("keep_agora_post_message_v5");
    expect(service).toContain('ACQUIRED_FROM_ANOTHER_USER');
  });
});
