// @ts-nocheck
// Panne/conflit transitoire de rafraîchissement : 409 ≠ « pas de session ».
// Jamais de droits restaurés depuis une session expirée ou un refus réel.
import { createAuthService } from '../authService';

const nowSec = () => Math.floor(Date.now() / 1000);
const persisted = (expiresAt: number) => JSON.stringify({
  access_token: 'a', refresh_token: 'r', expires_at: expiresAt, user: { id: 'u1', email: 'a@b.fr', user_metadata: { username: 'adel' } },
});
const clientWith = ({ getSession, refreshSession, stored }: any) => ({
  auth: {
    storageKey: 'k',
    storage: { getItem: jest.fn(async () => stored ?? null) },
    getSession,
    refreshSession,
  },
});

describe('getCurrentSession — conflit de rafraîchissement', () => {
  it('409 au rafraîchissement + session locale encore valide => session conservée', async () => {
    const c = clientWith({
      getSession: async () => ({ data: { session: null }, error: null }),
      refreshSession: async () => ({ data: { session: null }, error: { status: 409, message: 'conflict' } }),
      stored: persisted(nowSec() + 3600),
    });
    await expect(createAuthService(c as any).getCurrentSession()).resolves.toMatchObject({ userId: 'u1' });
  });

  it('409 + session locale EXPIRÉE => aucune session (jamais de droits depuis une session expirée)', async () => {
    const c = clientWith({
      getSession: async () => ({ data: { session: null }, error: null }),
      refreshSession: async () => ({ data: { session: null }, error: { status: 409, message: 'conflict' } }),
      stored: persisted(nowSec() - 60),
    });
    await expect(createAuthService(c as any).getCurrentSession()).rejects.toBeTruthy();
  });

  it('refus réel (400 jeton révoqué) même avec une session locale valide => null, aucune restauration', async () => {
    const c = clientWith({
      getSession: async () => ({ data: { session: null }, error: null }),
      refreshSession: async () => ({ data: { session: null }, error: { status: 400, message: 'Invalid Refresh Token: Refresh Token Not Found' } }),
      stored: persisted(nowSec() + 3600),
    });
    await expect(createAuthService(c as any).getCurrentSession()).resolves.toBeNull();
  });

  it('panne 503 sur getSession + session valide => conservée ; reprise normale ensuite', async () => {
    const c = clientWith({
      getSession: jest.fn()
        .mockResolvedValueOnce({ data: { session: null }, error: { status: 503, message: 'service unavailable' } })
        .mockResolvedValueOnce({ data: { session: { user: { id: 'u1', user_metadata: {} } } }, error: null }),
      refreshSession: async () => ({ data: { session: null }, error: null }),
      stored: persisted(nowSec() + 3600),
    });
    const svc = createAuthService(c as any);
    await expect(svc.getCurrentSession()).resolves.toMatchObject({ userId: 'u1' });
    await expect(svc.getCurrentSession()).resolves.toMatchObject({ userId: 'u1' });
  });
});
