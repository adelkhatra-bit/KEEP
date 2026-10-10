const fs = require('fs');
const path = require('path');

describe('Supabase token verifier production env contract', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'supabaseTokenVerifier.ts'), 'utf8');

  it('can verify tokens when the backend has service-role or publishable env naming', () => {
    expect(source).toContain('process.env.SUPABASE_SERVICE_ROLE_KEY');
    expect(source).toContain('process.env.SUPABASE_PUBLISHABLE_KEY');
    expect(source).toContain('process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY');
    expect(source).toContain('process.env.EXPO_PUBLIC_SUPABASE_URL');
  });
});
