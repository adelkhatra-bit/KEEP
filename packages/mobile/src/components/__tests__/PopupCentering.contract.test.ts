import fs from 'fs';
import path from 'path';

const mobileRoot = path.resolve(__dirname, '..', '..');
const read = (relativePath: string) => fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');

describe('Loki popup placement on mobile and desktop', () => {
  it('centers the listening hamburger session preview without ending the microphone session', () => {
    const home = read('screens/HomeScreenCompact.tsx');
    expect(home).toContain('testID="listen-session-peek-overlay"');
    expect(home).toContain('testID="listen-session-peek-centered"');
    expect(home).toContain("modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.72)', alignItems: 'center', justifyContent: 'center'");
    expect(home).toContain("maxWidth: 480, maxHeight: '78%', borderRadius: 22");
    expect(home).not.toContain("s.modalOverlay, { justifyContent: 'flex-end', paddingBottom: 0 }");
    expect(home).toContain('onPress={() => setSessionPeekOpen(false)}');
    expect(home).toContain('onPress={openSessionHistorySafely}');
  });

  it('centers global confirmations and all nested branded modal alerts', () => {
    const alert = read('components/AlertHost.tsx');
    const nested = read('components/ModalAlertLayer.tsx');
    expect(alert).toContain("alignItems: 'center', justifyContent: 'center'");
    expect(nested).toContain('<AlertCard current={current} press={press} />');
  });

  it('centers the shared KidsModal and solo history popup on iPhone', () => {
    const kids = read('components/KidsModal.tsx');
    const solo = read('components/KeepBattleSoloHistoryModal.tsx');
    expect(kids).toContain("justifyContent: 'center'");
    expect(kids).toContain("maxHeight: '85%'");
    expect(solo).toContain("justifyContent: 'center', alignItems: 'center'");
    expect(solo).toContain("maxWidth: 520, maxHeight: '82%'");
  });

  it('centers Mes Sessions on mobile without changing the desktop side panel', () => {
    const screen = read('screens/SessionHistoryScreen.tsx');
    expect(screen).toContain('testID="sessions-overlay-centered"');
    expect(screen).toContain("alignItems: desktop ? 'flex-end' : 'center'");
    expect(screen).toContain("width: Math.min(480, width - 24)");
    expect(screen).toContain("width: Math.min(480, width * 0.48)");
  });
});
