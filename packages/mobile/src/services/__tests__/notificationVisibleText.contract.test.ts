// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('Loki notification visible text normalization', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'notificationService.ts'), 'utf8');

  it('decodes legacy heart entities in one replacement pass', () => {
    expect(source).toContain('&amp;#x([0-9a-f]+)');
    expect(source).toContain('&amp;#([0-9]+)');
    expect(source).toContain('escapedHex ?? hex');
    expect(source).not.toContain("const transported = value");
  });

  it('keeps the Loki brand normalization and removes legacy KEEP text', () => {
    expect(source).toContain("replace(/\\bKEEP\\s+MUSIC\\b/gi, APP_NAME)");
    expect(source).toContain("replace(/\\bKEEP\\b/gi, 'Loki')");
    expect(source).toContain("replace(/\\bPAYPAL\\s+(?:KEEP|LOKI)\\s+PAYPAL\\b/gi, 'PayPal')");
  });
});
