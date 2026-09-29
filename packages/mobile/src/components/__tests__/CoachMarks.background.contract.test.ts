import fs from 'fs';
import path from 'path';

describe('CoachMarks backdrop contract', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'CoachMarks.tsx'), 'utf8');

  it('keeps the real Listen screen visible behind the first-run coach', () => {
    expect(source).toContain('<Modal visible={visible} transparent');
    const match = source.match(/overlay:\s*\{[^}]*backgroundColor:\s*'rgba\(5,4,10,([0-9.]+)\)'/);
    expect(match).not.toBeNull();
    const opacity = Number(match?.[1] ?? 1);
    expect(opacity).toBeLessThanOrEqual(0.25);
  });

  it('never returns to the opaque black backdrop that hid the application', () => {
    expect(source).not.toContain("rgba(5,4,10,0.82)");
    expect(source).not.toContain("rgba(5,4,10,0.56)");
  });
});
