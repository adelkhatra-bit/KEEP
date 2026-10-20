// ERR-SESSION-SYNC-STORM-20261020 — test de comportement (faux Supabase en mémoire) :
// compte les écritures keep_sync_device_session au démarrage, avec l'état réel du compte d'Adel
// (31 sessions supprimées dans le cloud, 6 actives identiques sur l'appareil).
const mockRpcCalls: Array<{ fn: string; args: any }> = [];
let mockSelectCalls = 0;
let mockRows: any[] = [];
let mockRealtimeHandler: (() => void) | null = null;

jest.mock('../supabaseClient', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } }, error: null }) },
    rpc: async (fn: string, args: any) => { mockRpcCalls.push({ fn, args }); mockRealtimeHandler?.(); return { data: true, error: null }; },
    from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => { mockSelectCalls += 1; return { data: mockRows, error: null }; } }) }) }) }),
    channel: () => { const ch: any = { on: (_e: any, _f: any, cb: () => void) => { mockRealtimeHandler = cb; return ch; }, subscribe: () => ch }; return ch; },
    removeChannel: async () => undefined,
  },
}));

const mockListeners = new Set<() => void>();
let mockHistoryState: any = { sessions: [], dismissedSessionIds: [] };
jest.mock('../../store/useSessionHistoryStore', () => ({
  isCloudProfileRecoverySession: () => false,
  useSessionHistoryStore: {
    getState: () => mockHistoryState,
    setState: (patch: any) => { mockHistoryState = { ...mockHistoryState, ...patch }; mockListeners.forEach((l) => l()); },
    subscribe: (l: () => void) => { mockListeners.add(l); return () => mockListeners.delete(l); },
    persist: { hasHydrated: () => true },
  },
}));
jest.mock('../../store/useUserStore', () => ({
  useUserStore: { getState: () => ({ user: { id: 'u1' }, isLocalGuest: false, isDemoMode: false }) },
}));

import { startCrossDeviceSessionSync } from '../sessionCloudSyncService';

const session = (id: string) => ({
  id, ownerUserId: 'u1', startedAt: '2026-10-20T19:00:00.000Z', endedAt: '2026-10-20T19:10:00.000Z', title: id,
  tracks: [{ id: `${id}-t`, status: 'pending', detectedAt: '2026-10-20T19:01:00.000Z', recommendations: [], track: { id: `${id}-tr`, title: 'T', artist: 'A' } }],
});
// jsonb renvoie les clés dans un autre ordre que l'appareil.
const asJsonb = (s: any) => JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(s).reverse())));

const flush = async (ms: number) => { await jest.advanceTimersByTimeAsync(ms); };

describe('synchro des sessions au démarrage : aucune rafale', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockRpcCalls.length = 0; mockSelectCalls = 0; mockRealtimeHandler = null; mockListeners.clear();
    const active = ['a', 'b', 'c', 'd', 'e', 'f'].map(session);
    const deletedIds = Array.from({ length: 31 }, (_, i) => `old-${i}`);
    mockRows = [
      ...active.map((s, i) => ({ session_id: s.id, snapshot: asJsonb(s), updated_at: `2026-10-20T19:2${i}:00Z`, deleted_at: null })),
      ...deletedIds.map((id) => ({ session_id: id, snapshot: {}, updated_at: '2026-10-19T10:00:00Z', deleted_at: '2026-10-19T10:00:00Z' })),
    ];
    mockHistoryState = { sessions: active, dismissedSessionIds: deletedIds };
  });
  afterEach(() => { jest.useRealTimers(); });

  it('n\'écrit rien et ne relit qu\'une fois quand l\'appareil et le cloud sont déjà d\'accord', async () => {
    const stop = startCrossDeviceSessionSync('u1');
    await flush(5000);
    stop();
    expect(mockRpcCalls.filter((c) => c.fn === 'keep_sync_device_session')).toHaveLength(0);
    expect(mockSelectCalls).toBe(1);
  });

  it('écrit une seule fois une vraie modification locale, sans relecture en écho', async () => {
    const stop = startCrossDeviceSessionSync('u1');
    await flush(1000);
    mockHistoryState = { ...mockHistoryState, sessions: mockHistoryState.sessions.map((s: any, i: number) => i === 0 ? { ...s, tracks: [{ ...s.tracks[0], status: 'kept' }] } : s) };
    mockListeners.forEach((l) => l());
    await flush(5000);
    stop();
    expect(mockRpcCalls.filter((c) => c.fn === 'keep_sync_device_session')).toHaveLength(1);
    expect(mockSelectCalls).toBe(1);
  });
});
