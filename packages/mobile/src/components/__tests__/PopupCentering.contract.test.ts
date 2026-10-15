import fs from 'fs';
import path from 'path';

const mobileRoot = path.resolve(__dirname, '..', '..');
const read = (relativePath: string) => fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');

describe('Loki popup placement on mobile and desktop', () => {
  it('centers the listening hamburger session preview without ending the microphone session', () => {
    const home = read('screens/HomeScreenCompact.tsx');
    expect(home).toContain('<KeepModal visible={sessionPeekOpen}');
    expect(home).toContain('onDismiss={showQueuedSessionSwipe}');
    expect(home).toContain("modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.72)', alignItems: 'center', justifyContent: 'center'");
    expect(home).toContain("maxWidth: desktopHome ? 580 : 400, maxHeight: '78%', borderRadius: 22");
    expect(home).toContain('onPress={openSessionSwipeSafely}');
    expect(home).toContain('ARRÊTER ET SWIPER');
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
    expect(screen).toContain('<View style={styles.overlay}>');
    expect(screen).toContain("overlay: { flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center'");
    expect(screen).toContain("width: Math.min(560, width - 32)");
    expect(screen).toContain("width: '100%', height: Math.min(height - 40, Math.round(height * 0.80))");
    expect(screen).toContain("borderRadius: 22");
  });
});
