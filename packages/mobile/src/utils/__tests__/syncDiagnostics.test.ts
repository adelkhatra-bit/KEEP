import fs from 'fs';
import path from 'path';

// Mesure temps réel / appels de secours (Adel, 21/10/2026) : compteurs seulement.

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { __resetSyncDiagnosticsForTests, countSyncDiagnostic, syncDiagnosticsSnapshot } from '../syncDiagnostics';

const SRC = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('syncDiagnostics', () => {
  beforeEach(async () => {
    __resetSyncDiagnosticsForTests();
    await AsyncStorage.clear();
  });

  it('compte sans jamais jeter, chiffres seulement', () => {
    countSyncDiagnostic('sessionTimerPull');
    countSyncDiagnostic('sessionTimerPull');
    countSyncDiagnostic('sessionTimerPullChanged');
    const snap = syncDiagnosticsSnapshot();
    expect(snap.sessionTimerPull).toBe(2);
    expect(snap.sessionTimerPullChanged).toBe(1);
    expect(typeof snap.since).toBe('string');
    expect(Object.values(snap).every((v) => typeof v === 'number' || typeof v === 'string')).toBe(true);
  });

  it('reprend les compteurs enregistrés après un redémarrage', async () => {
    await AsyncStorage.setItem('loki:sync-diagnostics:v1', JSON.stringify({ since: '2026-10-21T00:00:00.000Z', chatSafetyRefresh: 40, chatSafetyRefreshFoundNew: 1 }));
    countSyncDiagnostic('chatSafetyRefresh');
    await new Promise((r) => setTimeout(r, 0));
    const snap = syncDiagnosticsSnapshot();
    expect(snap.chatSafetyRefresh).toBe(41);
    expect(snap.chatSafetyRefreshFoundNew).toBe(1);
    expect(snap.since).toBe('2026-10-21T00:00:00.000Z');
  });
});

describe('contrat — les mesures sont branchées sans changer les fréquences', () => {
  it('synchro des sessions : secours 12 s et temps réel mesurés séparément', () => {
    const sync = read('services/sessionCloudSyncService.ts');
    expect(sync).toContain('const PULL_EVERY_MS = 12000;');
    expect(sync).toContain("countSyncDiagnostic('sessionTimerPull')");
    expect(sync).toContain("countSyncDiagnostic('sessionTimerPullChanged')");
    expect(sync).toContain("countSyncDiagnostic('sessionRealtimeEvent')");
    expect(sync).toContain("countSyncDiagnostic('sessionRealtimePullChanged')");
  });

  it('tchat : filet 2,5 s inchangé, utilité mesurée', () => {
    const chat = read('components/MusicAgoraPanel.tsx');
    expect(chat).toContain('}, 2500, { catchUp: false });');
    expect(chat).toContain("countSyncDiagnostic('chatRealtimeEvent')");
    expect(chat).toContain("countSyncDiagnostic('chatSafetyRefreshFoundNew')");
  });

  it('les compteurs ne partent qu’avec un signalement', () => {
    const report = read('services/problemReportService.ts');
    expect(report).toContain('sync = syncDiagnosticsSnapshot()');
    expect(read('utils/syncDiagnostics.ts')).not.toMatch(/supabase|fetch\(/);
  });
});
