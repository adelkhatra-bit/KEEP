// @ts-nocheck

jest.mock('expo/virtual/env', () => ({ env: process.env }), { virtual: true });

describe('authService edge function fallback', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    global.fetch = jest.fn();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function makeClient() {
    return {
      auth: {
        getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'token-123' } } }),
      },
      from: jest.fn(() => ({
        select: () => ({
          ilike: () => ({
            limit: jest.fn().mockResolvedValue({ data: [] }),
          }),
        }),
      })),
    };
  }

  it('lit le vrai code erreur JSON sur une réponse non-2xx', async () => {
    const client = makeClient();
    global.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: 'email_taken' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    }));

    const { createAuthService } = require('../authService');
    const result = await createAuthService(client).signUpWithEmailIdentity('test@example.com', 'tester', 'password123');

    expect(result.error).toBe('email_taken');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('retente keep-auth-email après une panne réseau transitoire', async () => {
    const client = makeClient();
    global.fetch
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));

    const { createAuthService } = require('../authService');
    const result = await createAuthService(client).requestPasswordReset('test@example.com');

    expect(result.error).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('remonte supabase_unavailable si la config publique manque', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    jest.resetModules();
    const { createAuthService } = require('../authService');
    const client = makeClient();

    return expect(
      createAuthService(client).requestPasswordReset('test@example.com'),
    ).resolves.toEqual({ error: 'supabase_unavailable' });
  });
});
