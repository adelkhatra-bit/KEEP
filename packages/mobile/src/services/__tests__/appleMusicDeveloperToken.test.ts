import { Platform } from 'react-native';
import { fetchAppleMusicDeveloperToken } from '../appleMusicAuth';
import { getSupabaseAccessToken, supabase } from '../supabaseClient';

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-secure-store', () => ({}));
jest.mock('../supabaseClient', () => ({
  getSupabaseAccessToken: jest.fn(),
  supabase: { functions: { invoke: jest.fn() } },
}));

const accessToken = getSupabaseAccessToken as jest.Mock;
const invoke = supabase!.functions.invoke as jest.Mock;
const developerToken = 'header.payload.signature';
const validPayload = () => ({ ok: true, token: developerToken, expiresAt: Math.floor(Date.now() / 1000) + 43200 });

beforeEach(() => {
  jest.clearAllMocks();
  accessToken.mockResolvedValue('user-session');
  invoke.mockResolvedValue({ data: validPayload(), error: null });
});

describe.each(['ios', 'android', 'web'])('Apple developer token adapter on %s', (platform) => {
  it('uses the same canonical Supabase endpoint and current user session', async () => {
    Object.assign(Platform, { OS: platform });
    await expect(fetchAppleMusicDeveloperToken()).resolves.toBe(developerToken);
    expect(invoke).toHaveBeenCalledWith('keep-apple-music-token', {
      method: 'POST', body: {}, headers: { Authorization: 'Bearer ' + 'user-session' }, timeout: 18000,
    });
    accessToken.mockResolvedValue('another-session');
    await fetchAppleMusicDeveloperToken();
    expect(invoke.mock.calls[1][1].headers.Authorization).toBe('Bearer ' + 'another-session');
  });
});

it('does not call the endpoint without an authenticated Loki session', async () => {
  accessToken.mockResolvedValue(null);
  await expect(fetchAppleMusicDeveloperToken()).rejects.toThrow('connecte-toi');
  expect(invoke).not.toHaveBeenCalled();
});

it.each([
  undefined,
  { ok: false },
  { ...validPayload(), token: '' },
  { ...validPayload(), token: 'not-a-jwt' },
  { ...validPayload(), expiresAt: 0 },
  { ...validPayload(), expiresAt: Math.floor(Date.now() / 1000) + 86400 },
])('rejects invalid or expired responses without upstream error details', async (data) => {
  invoke.mockResolvedValue({ data, error: null });
  await expect(fetchAppleMusicDeveloperToken()).rejects.toThrow('temporairement indisponible');
});

it('never exposes errors received from the server', async () => {
  invoke.mockResolvedValue({ data: { message: 'PRIVATE_UPSTREAM_ERROR' }, error: new Error('PRIVATE_UPSTREAM_ERROR') });
  await expect(fetchAppleMusicDeveloperToken()).rejects.toThrow('temporairement indisponible');
  invoke.mockRejectedValue(new Error('PRIVATE_UPSTREAM_ERROR'));
  await expect(fetchAppleMusicDeveloperToken()).rejects.toThrow('temporairement indisponible');
});
