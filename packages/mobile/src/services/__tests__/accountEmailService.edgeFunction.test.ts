// @ts-nocheck

jest.mock('expo/virtual/env', () => ({ env: process.env }), { virtual: true });

jest.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'token-123' } } }),
    },
  },
}));

jest.mock('../edgeFunctionClient', () => ({
  invokeEdgeFunction: jest.fn(),
}));

describe('accountEmailService edge function fallback', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('traduit email_send_failed à partir du vrai corps JSON de keep-account-email', async () => {
    const { invokeEdgeFunction } = require('../edgeFunctionClient');
    invokeEdgeFunction.mockResolvedValueOnce({ status: 500, data: { ok: false, error: 'email_send_failed' } });

    const { requestAccountEmailVerification } = require('../accountEmailService');

    await expect(requestAccountEmailVerification('test@example.com')).rejects.toThrow("Loki n’a pas pu envoyer l’e-mail. Réessaie plus tard.");
    expect(invokeEdgeFunction).toHaveBeenCalledTimes(1);
  });
});
