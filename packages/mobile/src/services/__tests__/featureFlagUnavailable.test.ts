// @ts-nocheck
// ERR-132 : panne PostgREST (503 / PGRST002) ≠ fonction désactivée.
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
const mockRpc = jest.fn();
const mockMaybeSingle = jest.fn();
jest.mock('../supabaseClient', () => ({
  supabase: {
    rpc: (...a: any[]) => mockRpc(...a),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => mockMaybeSingle() }) }) }),
  },
}));

import { getFeatureState, isFeatureEnabled } from '../featureFlagService';

const outage = { message: 'Could not query the database for the schema cache. Retrying.', code: 'PGRST002' };

describe('featureFlagService — indisponible ≠ désactivé', () => {
  beforeEach(() => { mockRpc.mockReset(); mockMaybeSingle.mockReset(); });

  it('503 sur la RPC puis 503 sur la table => unavailable (jamais enabled, jamais disabled)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: outage });
    mockMaybeSingle.mockResolvedValue({ data: null, error: outage });
    await expect(getFeatureState('local_discovery')).resolves.toBe('unavailable');
    await expect(isFeatureEnabled('local_discovery')).resolves.toBe(false);
  });

  it('exception réseau/délai sur la RPC et la table => unavailable', async () => {
    mockRpc.mockRejectedValue(new Error('timeout'));
    mockMaybeSingle.mockRejectedValue(new Error('timeout'));
    await expect(getFeatureState('local_discovery')).resolves.toBe('unavailable');
  });

  it('reprise : après la panne, la même clé redevient enabled', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: outage }).mockResolvedValueOnce({ data: true, error: null });
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: outage });
    await expect(getFeatureState('local_discovery')).resolves.toBe('unavailable');
    await expect(getFeatureState('local_discovery')).resolves.toBe('enabled');
  });

  it('refus réel : la RPC répond false => disabled (pas unavailable)', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    await expect(getFeatureState('local_discovery')).resolves.toBe('disabled');
    await expect(isFeatureEnabled('local_discovery')).resolves.toBe(false);
  });

  it('RPC en erreur mais la table répond « flag absent » => disabled ; flag actif => enabled', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } });
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(getFeatureState('x')).resolves.toBe('disabled');
    mockMaybeSingle.mockResolvedValueOnce({ data: { is_enabled_globally: true, rollout_percent: 100 }, error: null });
    await expect(getFeatureState('x')).resolves.toBe('enabled');
  });
});
