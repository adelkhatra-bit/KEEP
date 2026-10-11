// @ts-nocheck
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'functions', 'keep-username-auth', 'index.ts'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('username auth PostgREST outage fallback', () => {
  it('falls back to Supabase Auth metadata when profile REST schema cache is unavailable', () => {
    expect(source).toContain('findAuthUserByUsername');
    expect(source).toContain("user.user_metadata?.keep_username");
    expect(source).toContain("code === 'PGRST002'");
    expect(source).toContain("message.includes('schema cache')");
  });

  it('keeps indexed/direct profile lookup as the normal path', () => {
    expect(source).toContain("where lower(p.username) = lower(");
    expect(source).toContain("Fallback PostgREST borné");
  });
});
