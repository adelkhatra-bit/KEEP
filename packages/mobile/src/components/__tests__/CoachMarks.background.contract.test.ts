import fs from 'fs';
import path from 'path';

describe('CoachMarks backdrop contract', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'CoachMarks.tsx'), 'utf8');

  it('is attached to the real Listen screen instead of opening a separate modal page', () => {
    expect(source).not.toContain('<Modal');
    expect(source).not.toContain('Modal,');
    expect(source).toContain('...StyleSheet.absoluteFillObject');
    expect(source).toContain('zIndex: 50');
  });

  it('keeps the real application visible behind the first-run coach', () => {
    const match = source.match(/overlay:\s*\{[^}]*backgroundColor:\s*'rgba\(5,4,10,([0-9.]+)\)'/);
    expect(match).not.toBeNull();
    const opacity = Number(match?.[1] ?? 1);
    expect(opacity).toBeLessThanOrEqual(0.10);
  });

  it('never returns to an opaque black backdrop that hides the application', () => {
    expect(source).not.toContain("rgba(5,4,10,0.82)");
    expect(source).not.toContain("rgba(5,4,10,0.56)");
    expect(source).not.toContain("rgba(5,4,10,0.18)");
  });
});
