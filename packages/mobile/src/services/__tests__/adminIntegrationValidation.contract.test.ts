// @ts-nocheck
import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
const read = (...segments: string[]) =>
  fs.readFileSync(path.join(repoRoot, ...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Super Admin integrations — validate credentials before activation', () => {
  const adminUi = read('packages', 'admin', 'pages', 'integrations.tsx');
  const edge = read('supabase', 'functions', 'keep-admin-control', 'index.ts');

  it('accepts legitimate multiline/name values instead of rejecting every whitespace character', () => {
    expect(adminUi).toContain('MULTILINE_KEYS');
    expect(adminUi).toContain("'APPLE_MUSICKIT_PRIVATE_KEY'");
    expect(adminUi).toContain("'APPLE_IAP_PRIVATE_KEY'");
    expect(adminUi).toContain("'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON'");
    expect(adminUi).toContain('WHITESPACE_ALLOWED_KEYS');
    expect(adminUi).toContain("'BREVO_SENDER_NAME'");
    expect(adminUi).toContain('<textarea');
  });

  it('shows persistent provider health instead of only saying configured', () => {
    expect(adminUi).toContain("type IntegrationStatus = 'UNKNOWN' | 'ACTIVE' | 'EXHAUSTED' | 'ERROR' | 'NOT_CONFIGURED'");
    expect(adminUi).toContain('STATUS_LABELS');
    expect(adminUi).toContain('lastCheckedAt');
    expect(adminUi).toContain('lastError');
    expect(adminUi).toContain('result?.validation?.valid');
  });

  it('rejects bad critical provider credentials before writing them to Vault', () => {
    expect(edge).toContain('validateBrevoApiKey');
    expect(edge).toContain('validateYouTubeApiKey');
    expect(edge).toContain('validateStripeSecretKey');
    expect(edge).toContain('validateAuddToken');
    expect(edge).toContain('validateAcrCloudCredentials');

    const directValidation = edge.indexOf('const directProviderValidation =');
    const rejected = edge.indexOf('provider_rejected_key', directValidation);
    const vaultWrite = edge.indexOf('service_set_integration_secret', directValidation);
    expect(directValidation).toBeGreaterThanOrEqual(0);
    expect(rejected).toBeGreaterThan(directValidation);
    expect(vaultWrite).toBeGreaterThan(rejected);
  });

  it('validates structured Apple and Google credentials before activation', () => {
    expect(edge).toContain('validateStructuredIntegrationValue');
    expect(edge).toContain('Clé privée Apple PEM reconnue.');
    expect(edge).toContain('JSON Service Account Google reconnu.');
    expect(edge).toContain('GOOGLE_PLAY_PACKAGE_NAME');
    expect(edge).toContain('STRIPE_WEBHOOK_SECRET');
  });

  it('never sends stored secret values back in the integrations list', () => {
    const listStart = edge.indexOf('if (action === "integrations.list")');
    const setStart = edge.indexOf('if (action === "integrations.set")');
    const listBlock = edge.slice(listStart, setStart);
    expect(listBlock).toContain('hint:');
    expect(listBlock).not.toContain('service_get_integration_secret');
    expect(listBlock).not.toMatch(/value\s*:/);
  });
});
