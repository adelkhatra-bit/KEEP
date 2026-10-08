import fs from 'fs';
import path from 'path';

const mockState = { owner: 'user-a', foreground: 'active' };
const mockRpc = jest.fn().mockResolvedValue({ error: null });
const mockGetSession = jest.fn(async () => ({
  data: { session: mockState.owner ? { user: { id: mockState.owner } } : null },
}));
jest.mock('../supabaseClient', () => ({ supabase: { rpc: mockRpc, auth: { getSession: mockGetSession } } }));
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: { get currentState() { return mockState.foreground; } },
}));

const { formatProfilePresence, pingProfilePresence, resetProfilePresenceHeartbeat } = require('../profilePresenceService');

describe('présence légère bornée à cinq minutes', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-08T10:00:00Z'));
    resetProfilePresenceHeartbeat();
    mockRpc.mockClear();
    mockGetSession.mockClear();
    mockState.owner = 'user-a';
    mockState.foreground = 'active';
  });
  afterEach(() => jest.useRealTimers());

  it('startup, appels concurrents et retours foreground ne multiplient pas les RPC', async () => {
    await Promise.all([pingProfilePresence(), pingProfilePresence()]);
    await pingProfilePresence();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('keep_profile_presence_ping');
    jest.advanceTimersByTime(299999);
    await pingProfilePresence();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    await pingProfilePresence();
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it('ne fait aucun réseau en arrière-plan et ne pingue pas après logout', async () => {
    mockState.foreground = 'background';
    await pingProfilePresence();
    expect(mockGetSession).not.toHaveBeenCalled();
    mockState.foreground = 'active';
    mockState.owner = '';
    await pingProfilePresence();
    expect(mockRpc).not.toHaveBeenCalled();
    mockState.owner = 'user-b';
    await pingProfilePresence();
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('limite aussi les tentatives quand le serveur refuse le ping', async () => {
    mockRpc.mockResolvedValueOnce({ error: { message: 'offline' } });
    await pingProfilePresence();
    await pingProfilePresence();
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('affiche une durée française, sans inventer une date absente ou invalide', () => {
    expect(formatProfilePresence('2026-10-08T09:48:00Z', false)).toBe('vu il y a 12 min');
    expect(formatProfilePresence('2026-10-08T10:01:00Z', false)).toBe('vu il y a 0 min');
    expect(formatProfilePresence(null, true)).toBe('En ligne');
    expect(formatProfilePresence(null, false)).toBe('Hors ligne');
    expect(formatProfilePresence('invalid', false)).toBe('Hors ligne');
  });
});

describe('migration additive présence, appareils et Santé', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, '../../../../../supabase/migrations/20261008102000_presence_push_health.sql'), 'utf8');
  it('borne les écritures à auth.uid, sans droit RPC anonyme ni réinitialisation de données', () => {
    expect(sql).toContain("uid uuid := auth.uid()");
    expect(sql).toContain('where id = uid');
    expect(sql).toContain("last_seen_at <= now() - interval '5 minutes'");
    expect(sql).toContain('revoke all on function public.keep_profile_presence_ping() from public, anon');
    expect(sql).toContain('grant execute on function public.keep_profile_presence_ping() to authenticated');
    expect(sql).not.toMatch(/truncate|drop table|delete from public\.profiles/i);
  });
  it('préserve RLS et cloisonne Santé aux admins actifs, sans publier les tokens', () => {
    expect(sql).not.toMatch(/disable row level security/i);
    expect(sql).toContain("a.id = auth.uid() and a.is_active = true");
    expect(sql).toContain("('NO_DEVICE')");
    expect(sql).toContain("interval '24 hours'");
    expect(sql).toContain('count(n.id)');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('pt.device_id = device and pt.token <> trim(p_token)');
    expect(sql).toContain('where token = trim(p_token) and profile_id = uid');
    expect(sql).toContain('revoke all on function public.keep_push_token_register_v4');
  });
});
