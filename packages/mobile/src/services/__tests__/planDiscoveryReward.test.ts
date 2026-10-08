let mockRows: Array<{ key: string; value: unknown }> = [];
const mockQuery = jest.fn(async (_column: string, _keys: string[]) => ({ data: mockRows, error: null }));
jest.mock('../supabaseClient', () => ({
  supabase: { from: () => ({ select: () => ({ in: (column: string, keys: string[]) => mockQuery(column, keys) }) }) },
}));

import { CREDIT_FUNNEL_DEFAULTS, loadCreditFunnel } from '../planService';

describe('récompense découvreur dans les offres', () => {
  beforeEach(() => { mockRows = []; mockQuery.mockClear(); });

  it('utilise les valeurs par défaut 3 FREE et plafond 20 si les clés sont absentes', async () => {
    expect(CREDIT_FUNNEL_DEFAULTS.firstDiscoveryFreePerKeep).toBe(3);
    expect(CREDIT_FUNNEL_DEFAULTS.firstDiscoveryMonthlyFreeCap).toBe(20);
    const funnel = await loadCreditFunnel();
    expect(funnel.firstDiscoveryFreePerKeep).toBe(3);
    expect(funnel.firstDiscoveryMonthlyFreeCap).toBe(20);
    expect(mockQuery).toHaveBeenCalledWith('key', expect.arrayContaining([
      'first_discovery_free_per_keep', 'first_discovery_monthly_free_cap',
    ]));
  });

  it('affiche les réglages Super Admin, y compris zéro', async () => {
    mockRows = [
      { key: 'first_discovery_free_per_keep', value: 0 },
      { key: 'first_discovery_monthly_free_cap', value: 8 },
    ];
    const funnel = await loadCreditFunnel();
    expect(funnel.firstDiscoveryFreePerKeep).toBe(0);
    expect(funnel.firstDiscoveryMonthlyFreeCap).toBe(8);
  });

  it('borne les montants négatifs et ignore une configuration non numérique', async () => {
    mockRows = [
      { key: 'first_discovery_free_per_keep', value: -2 },
      { key: 'first_discovery_monthly_free_cap', value: 'invalide' },
    ];
    const funnel = await loadCreditFunnel();
    expect(funnel.firstDiscoveryFreePerKeep).toBe(0);
    expect(funnel.firstDiscoveryMonthlyFreeCap).toBe(20);
  });
});
