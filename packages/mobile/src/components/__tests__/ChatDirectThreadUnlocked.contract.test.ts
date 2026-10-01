// @ts-nocheck
import fs from 'fs';
import path from 'path';

const panel = fs.readFileSync(
  path.resolve(__dirname, '..', 'MusicAgoraPanel.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('Loki direct chat remains writable contract', () => {
  it('does not reintroduce the obsolete three-unanswered-messages lock', () => {
    expect(panel).not.toContain('awaitingDirectReply');
    expect(panel).not.toContain('unansweredDirectCount');
    expect(panel).not.toContain('direct_reply_required');
    expect(panel).not.toContain('3 messages sans réponse');
  });

  it('keeps normal direct chat controls available', () => {
    expect(panel).toContain('placeholder="Écris un message…"');
    expect(panel).toContain('<Text style={s.drawerActionText}>RÉACTIONS</Text>');
    expect(panel).toContain('<Text style={s.drawerActionText}>MORCEAU</Text>');
    expect(panel).toContain('<Text style={s.drawerActionText}>QR PAYPAL</Text>');
  });

  it('keeps the real frequency anti-spam error handling', () => {
    expect(panel).toContain("message.includes('rate_limited')");
  });
});
