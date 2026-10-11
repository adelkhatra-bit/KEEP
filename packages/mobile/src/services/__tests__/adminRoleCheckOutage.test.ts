// @ts-nocheck
// ERR-130/132 : Super Admin — panne RPC ≠ refus de rôle.
import { checkAdminRole } from '../../../../admin/lib/adminRoleCheck';

const rpcWith = (impl: () => Promise<any>) => ({ rpc: jest.fn(impl) });

describe('checkAdminRole — accès protégé fermé tant que le rôle est inconnu', () => {
  it('RPC 503 (PGRST002) => error : ni allowed, ni denied (la session est conservée, Réessayer proposé)', async () => {
    const c = rpcWith(async () => ({ data: null, error: { code: 'PGRST002', message: 'schema cache' } }));
    await expect(checkAdminRole(c, 50)).resolves.toBe('error');
  });

  it('RPC qui ne répond jamais => error après le délai (plus de « Vérification… » infinie)', async () => {
    const c = rpcWith(() => new Promise(() => {}));
    const t0 = Date.now();
    await expect(checkAdminRole(c, 40)).resolves.toBe('error');
    expect(Date.now() - t0).toBeLessThan(1500);
  });

  it('RPC qui rejette (réseau) => error', async () => {
    await expect(checkAdminRole(rpcWith(async () => { throw new Error('network'); }), 50)).resolves.toBe('error');
  });

  it('client absent => error (jamais allowed)', async () => {
    await expect(checkAdminRole(null, 50)).resolves.toBe('error');
  });

  it('reprise : après la panne, le même client renvoie allowed', async () => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST002' } })
      .mockResolvedValueOnce({ data: 'SUPER_ADMIN', error: null });
    await expect(checkAdminRole({ rpc }, 50)).resolves.toBe('error');
    await expect(checkAdminRole({ rpc }, 50)).resolves.toBe('allowed');
  });

  it('refus réel : aucun rôle, rôle inconnu ou rôle vide => denied (aucun accès)', async () => {
    for (const data of [null, '', 'USER', 'viewer']) {
      await expect(checkAdminRole(rpcWith(async () => ({ data, error: null })), 50)).resolves.toBe('denied');
    }
  });
});
