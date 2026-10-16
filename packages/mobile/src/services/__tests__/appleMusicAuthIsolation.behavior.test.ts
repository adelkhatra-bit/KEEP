// Comportement réel (pas de lecture de source) : le Music User Token Apple est
// isolé par compte Loki Music, l'ancienne clé globale est purgée, et le
// nettoyage au logout ne touche que le jeton du compte concerné.
const LEGACY = 'keep.appleMusic.musicUserToken';

type Store = Map<string, string>;

function loadAuth(os: 'web' | 'ios') {
  const secure: Store = new Map();
  const local: Store = new Map();
  let mod: any;
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({ Platform: { OS: os } }));
    jest.doMock('expo-secure-store', () => ({
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when_unlocked_this_device_only',
      setItemAsync: jest.fn(async (k: string, v: string) => { secure.set(k, v); }),
      getItemAsync: jest.fn(async (k: string) => (secure.has(k) ? secure.get(k)! : null)),
      deleteItemAsync: jest.fn(async (k: string) => { secure.delete(k); }),
    }));
    (global as any).localStorage = {
      setItem: (k: string, v: string) => { local.set(k, v); },
      getItem: (k: string) => (local.has(k) ? local.get(k)! : null),
      removeItem: (k: string) => { local.delete(k); },
    };
    mod = require('../appleMusicAuth');
  });
  return { mod, secure, local };
}

describe.each([['ios'], ['web']] as const)('Apple Music token isolation (%s)', (os) => {
  const store = (t: ReturnType<typeof loadAuth>) => (os === 'web' ? t.local : t.secure);

  it('keeps two accounts on the same device fully separated', async () => {
    const t = loadAuth(os);
    await t.mod.saveMusicUserToken('user-A', 'tok-A');
    await t.mod.saveMusicUserToken('user-B', 'tok-B');
    expect(await t.mod.getSavedMusicUserToken('user-A')).toBe('tok-A');
    expect(await t.mod.getSavedMusicUserToken('user-B')).toBe('tok-B');
    expect(await t.mod.getSavedMusicUserToken('user-C')).toBeNull();
    expect(store(t).has(`${LEGACY}.user-A`)).toBe(true);
    expect(store(t).has(`${LEGACY}.user-B`)).toBe(true);
  });

  it('purges the legacy global key and never hands it to another account', async () => {
    const t = loadAuth(os);
    store(t).set(LEGACY, 'old-global-token');
    expect(await t.mod.getSavedMusicUserToken('user-A')).toBeNull();
    expect(store(t).has(LEGACY)).toBe(false);

    store(t).set(LEGACY, 'old-global-token');
    await t.mod.saveMusicUserToken('user-A', 'tok-A');
    expect(store(t).has(LEGACY)).toBe(false);
    expect(await t.mod.getSavedMusicUserToken('user-A')).toBe('tok-A');
  });

  it('logout clears only the leaving account token (and the legacy key)', async () => {
    const t = loadAuth(os);
    await t.mod.saveMusicUserToken('user-A', 'tok-A');
    await t.mod.saveMusicUserToken('user-B', 'tok-B');
    store(t).set(LEGACY, 'old-global-token');
    await t.mod.clearSavedMusicUserToken('user-A');
    expect(await t.mod.getSavedMusicUserToken('user-A')).toBeNull();
    expect(await t.mod.getSavedMusicUserToken('user-B')).toBe('tok-B');
    expect(store(t).has(LEGACY)).toBe(false);
  });

  it('refuses to read or write without a Loki Music account', async () => {
    const t = loadAuth(os);
    await expect(t.mod.saveMusicUserToken('', 'x')).rejects.toThrow('compte Loki Music requis');
    await expect(t.mod.getSavedMusicUserToken('  ')).rejects.toThrow('compte Loki Music requis');
  });

  it('sanitises the profile id so keys cannot collide with the legacy key', () => {
    const t = loadAuth(os);
    expect(t.mod.musicUserTokenStorageKey('a/b c')).toBe(`${LEGACY}.a_b_c`);
  });
});
