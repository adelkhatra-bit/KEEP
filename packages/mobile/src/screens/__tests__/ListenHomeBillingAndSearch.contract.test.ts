import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..', '..', '..', '..');
const source = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), 'utf8');

describe('Écouter : accueil unique, quota serveur et session sans microphone', () => {
  const home = source('packages', 'mobile', 'src', 'screens', 'HomeScreenCompact.tsx');
  const store = source('packages', 'mobile', 'src', 'store', 'useSessionStore.ts');

  it('affiche les identifications consommées depuis le serveur et non les doublons détectés', () => {
    expect(home).toContain('listenEconomyStatus.used');
    expect(home).toContain('Écoutes consommées');
    expect(home).toContain('listen-server-quota-summary');
    expect(home).not.toContain('label="Détectés"');
    expect(home).toContain('>MUSIQUE DÉTECTÉE</Text>');
  });

  it('place la recherche manuelle uniquement sur la page accueil', () => {
    expect(home).toContain('testID="home-manual-search"');
    expect(home).toContain('onPress={openManualSearchFromHome}');
    expect(home).toContain('startSession({ startPaused: true })');
    expect(home).toContain('manualSearchStartedFromHome.current');
    expect(home).not.toContain('testID="listen-tab-audio-option"');
    expect(home).toContain('testID="home-tab-audio-option"');
    expect(home.match(/Tu connais le titre \? Cherche-le toi-même/g)).toHaveLength(2);
  });

  it('permet une recherche sans démarrer le microphone', () => {
    expect(store).toContain('startSession: (options?: { startPaused?: boolean }) => void;');
    expect(store).toContain("if (!options?.startPaused) prepareAudioCaptureFromUserGesture();");
    expect(store).toContain('micPaused: Boolean(options?.startPaused)');
    expect(home).toContain('submitManualSearch(manualSearchQuery)');
  });

  it('refuse une reconnaissance non comptabilisée si le RPC échoue', () => {
    expect(store).toContain('if (!economy && !serverRecorded)');
    expect(store).toContain("return 'inactive';");
    expect(store).toContain("economy.reason === 'INSUFFICIENT_FREE'");
    expect(store).toContain('if (!serverRecorded) {');
    expect(store).toContain('clearNextPaidListenFreeAuthorization();');
  });
});
