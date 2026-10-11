import { withActionTimeout, isActionTimeout } from '../actionTimeout';

describe('withActionTimeout (bouton jamais bloqué sur PATIENTER)', () => {
  it('rend la valeur si elle arrive à temps', async () => {
    await expect(withActionTimeout(Promise.resolve(3), 50, 'x')).resolves.toBe(3);
  });
  it('échoue proprement si rien ne revient', async () => {
    const never = new Promise(() => {});
    await expect(withActionTimeout(never, 20, 'claim')).rejects.toThrow('ACTION_TIMEOUT:claim');
    try { await withActionTimeout(never, 10, 'claim'); } catch (e) { expect(isActionTimeout(e)).toBe(true); }
  });
});
