// @ts-nocheck
import fs from 'fs';
import path from 'path';

const dock = fs.readFileSync(path.resolve(__dirname, '..', 'GlobalChatDock.tsx'), 'utf8').replace(/\r\n/g, '\n');
const workflow = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', '.github', 'workflows', 'mobile-web-importmeta-diagnostic.yml'), 'utf8').replace(/\r\n/g, '\n');

describe('global chat scale and visual proof contract', () => {
  it('does not load shareable tracks while the messenger is closed', () => {
    expect(dock).toContain('if (!open) return;');
    expect(dock).toContain('loadMusicAgoraShareableTracks(160)');
    expect(dock).not.toContain("if (!accountReady || (!chatEnabled && !open))");
  });

  it('keeps the preview-only visual override isolated to CI', () => {
    expect(dock).toContain("process.env.EXPO_PUBLIC_KEEP_CHAT_VISUAL_TEST === '1'");
    expect(dock).toContain('enabled={accountReady || visualTestPreview}');
    expect(workflow).toContain("EXPO_PUBLIC_KEEP_CHAT_VISUAL_TEST: '1'");
  });

  it('le gardien mobile + ordinateur pose le même drapeau, sinon il ne trouve pas le bouton « Ouvrir le Tchat »', () => {
    const guardian = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', '.github', 'workflows', 'keep-dual-viewport-guardian.yml'), 'utf8').replace(/\r\n/g, '\n');
    expect(guardian).toContain("EXPO_PUBLIC_KEEP_PREVIEW: '1'");
    expect(guardian).toContain("EXPO_PUBLIC_KEEP_CHAT_VISUAL_TEST: '1'");
    expect(guardian).toContain('Ouvrir le Tchat|Activer et ouvrir le Tchat');
    // Libellé aperçu sans drapeau : volontairement différent de celui que le gardien cherche.
    expect(dock).toContain("previewOnly && !visualTestPreview ? 'Se connecter pour ouvrir le Tchat'");
  });

  it('captures the actual full-screen 390x844 chat design', () => {
    expect(workflow).toContain("getByTestId('loki-chat-fullscreen-modal')");
    expect(workflow).toContain("keep-chat-fullscreen-390x844.png");
    expect(workflow).toContain("getByPlaceholder('Rechercher une conversation…')");
    // e8ff5a48 fix(chat): pin messenger to real mobile viewport — entrée La Place ciblée par testID.
    expect(workflow).toContain("getByTestId('loki-chat-place-entry')");
    expect(workflow).toContain("getByLabel('Ouvrir les actions du message')");
    expect(workflow).toContain("getByText('RÉACTIONS', { exact: true })");
    expect(workflow).toContain("getByText('MORCEAU', { exact: true })");
    expect(workflow).toContain("getByText('QR PAYPAL', { exact: true })");
    expect(workflow).toContain("keep-chat-actions-390x844.png");
  });
});
