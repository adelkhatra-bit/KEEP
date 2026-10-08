import fs from 'fs';
import path from 'path';
import vm from 'vm';

const root = path.resolve(__dirname, '../../../../..');
const contractPath = path.join(root, 'config/keep-product-contract.json');
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const guard = fs.readFileSync(path.join(root, 'scripts/verify-product-contract.cjs'), 'utf8');

function validate(overrides: Record<string, unknown>) {
  const errors: string[] = [];
  vm.runInNewContext(guard, {
    __dirname: path.join(root, 'scripts'),
    require: (name: string) => name === 'fs' ? {
      ...fs,
      readFileSync: (file: string, encoding: BufferEncoding) => file === contractPath
        ? JSON.stringify({ ...contract, musicLinkImports: { ...contract.musicLinkImports, ...overrides } })
        : fs.readFileSync(file, encoding),
    } : require(name),
    process: { env: {}, exit: () => {} },
    console: { log: () => {}, error: (message: string) => errors.push(message) },
  });
  return errors.join('\n');
}

describe('imports musicaux : contrat anti-régression', () => {
  it('valide les sources canoniques sans nouvelle table', () => {
    expect(validate({})).toBe('');
  });
  it.each([
    { demoWritesAllowed: true },
    { importFreeCost: 1 },
    { tasteSource: 'profile_music_genre_affinity' },
    { providerConnectionsTable: 'music_provider_connections' },
    { cacheDays: 1 },
    { identityOrder: ['provider'] },
    { helpTrigger: 'En savoir plus' },
    { minimumFontSize: 10 },
    { sharedMobileWebImplementation: false },
  ])('refuse une régression %j', (change) => {
    expect(validate(change)).toContain('music imports must');
  });
});
