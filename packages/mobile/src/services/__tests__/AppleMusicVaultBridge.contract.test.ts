import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..', '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

describe('MusicKit Supabase Vault : authentifié et sans secret dans le client', () => {
  it('le serveur ne signe le JWT ES256 que pour un utilisateur authentifié', () => {
    const edge = read('supabase/functions/keep-apple-music-token/index.ts');
    expect(edge).toContain('admin.auth.getUser(auth)');
    expect(edge).toContain('user.is_anonymous');
    expect(edge).toContain('service_get_integration_secret');
    expect(edge).toContain('APPLE_MUSICKIT_PRIVATE_KEY');
    expect(edge).toContain('namedCurve: "P-256"');
    expect(edge).toContain('hash: "SHA-256"');
    expect(edge).toContain('signature.length !== 64');
    expect(edge).not.toContain('EXPO_PUBLIC_APPLE_MUSICKIT_PRIVATE_KEY');
  });

  it('l’application utilise Vault en priorité avant le backend historique', () => {
    const engine = read('packages/mobile/src/services/musicEngine.ts');
    expect(engine).toContain("supabase.functions.invoke('keep-apple-music-token'");
    expect(engine).toContain('if (isPlaceholder(apiUrl))');
    expect(engine).toContain("fetch(`${apiUrl}/api/music/apple/developer-token`");
    expect(engine).not.toContain("process.env.EXPO_PUBLIC_APPLE_MUSICKIT_PRIVATE_KEY");
  });

  it('la fonction ne distribue pas le token à un invité non authentifié', () => {
    const edge = read('supabase/functions/keep-apple-music-token/index.ts');
    expect(edge).toContain('if (!auth) return response(401');
    expect(edge).toContain('user.is_anonymous) return response(401');
    expect(edge).toContain('"Cache-Control": "no-store"');
  });
});
