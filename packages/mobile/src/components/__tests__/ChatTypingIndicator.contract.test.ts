import fs from 'fs';
import path from 'path';
import { useGlobalChatStore } from '../../store/useGlobalChatStore';

// Adel (02/10/2026) : « quand quelqu'un commence à m'écrire, une petite
// languette me dit qu'il est en train d'écrire ».
const service = fs.readFileSync(path.join(__dirname, '..', '..', 'services', 'musicAgoraService.ts'), 'utf8');
const panel = fs.readFileSync(path.join(__dirname, '..', 'MusicAgoraPanel.tsx'), 'utf8');
const dock = fs.readFileSync(path.join(__dirname, '..', 'GlobalChatDock.tsx'), 'utf8');

describe('« en train d’écrire »', () => {
  it('is an ephemeral broadcast to the recipient channel (nothing stored)', () => {
    expect(service).toContain('`keep-agora-typing:${profileId}`');
    expect(service).toContain("(channel as any).httpSend('typing', signal)");
    expect(service).not.toMatch(/from\('[a-z_]*typing/);
  });

  it('is throttled to one signal every 3 s while typing', () => {
    expect(panel).toContain('Date.now() - typingSentAtRef.current < 3000');
    expect(panel).toContain('if (value.trim()) signalTyping();');
  });

  it('shows a side tab (not during a game) and a line in the open thread', () => {
    expect(dock).toContain('{!open && latestTyping && !gameInProgress ? (');
    expect(dock).toContain('}, 6000);');
    expect(panel).toContain('est en train d’écrire…</Text>');
  });

  it('store keeps one entry per conversation and clears it', () => {
    useGlobalChatStore.getState().setTyping('p:a', 'alice');
    expect(useGlobalChatStore.getState().typingByKey['p:a']?.username).toBe('alice');
    useGlobalChatStore.getState().clearTyping('p:a');
    expect(useGlobalChatStore.getState().typingByKey['p:a']).toBeUndefined();
  });
});
