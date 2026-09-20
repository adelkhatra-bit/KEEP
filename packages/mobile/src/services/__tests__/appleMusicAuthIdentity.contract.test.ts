// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('Apple Music token account isolation', () => {
  const auth = fs.readFileSync(path.resolve(__dirname, '..', 'appleMusicAuth.ts'), 'utf8');
  const engine = fs.readFileSync(path.resolve(__dirname, '..', 'musicEngine.ts'), 'utf8');
  const userStore = fs.readFileSync(path.resolve(__dirname, '..', '..', 'store', 'useUserStore.ts'), 'utf8');

  it('namespaces every stored token by Loki profile and never reads the legacy global key', () => {
    expect(auth).toContain('musicUserTokenStorageKey(profileId)');
    expect(auth).toContain('return `${LEGACY_SECURE_STORE_KEY}.${cleanProfileId}`');
    expect(auth).toContain('localStorage.getItem(storageKey)');
    expect(auth).not.toContain('return localStorage.getItem(LEGACY_SECURE_STORE_KEY)');
  });

  it('loads the Apple token for the currently authenticated Loki account only', () => {
    expect(engine).toContain('useUserStore.getState().user?.id');
    expect(engine).toContain('getSavedMusicUserToken(profileId)');
  });

  it('cleans the previous account token on logout and identity changes', () => {
    expect(userStore).toContain('clearAppleMusicIdentity(get().user?.id)');
    expect(userStore).toContain('clearAppleMusicIdentity(state.user?.id)');
    expect(userStore).toContain('clearSavedMusicUserToken(profileId)');
  });
});
