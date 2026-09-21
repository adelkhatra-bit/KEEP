// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('LockedFeatureCard (Adel, 21/09/2026, principe produit : "toutes les fonctions doivent rester visibles, même verrouillées")', () => {
  const source = readNormalized(__dirname, '..', 'LockedFeatureCard.tsx');

  it('exposes exactly the props from the mission spec: nom de la fonction, condition requise, état actuel, bénéfice, action', () => {
    expect(source).toContain('unlocked: boolean;');
    expect(source).toContain('title: string;');
    expect(source).toContain('requirementLabel: string;');
    expect(source).toContain('current: number;');
    expect(source).toContain('required: number;');
    expect(source).toContain('benefit: string;');
    expect(source).toContain('actionLabel?: string;');
    expect(source).toContain('onAction?: () => void;');
  });

  it('never hides the feature entirely -- renders only children (no wrapper) when unlocked', () => {
    expect(source).toContain('if (unlocked) return <>{children}</>;');
  });

  it('shows the locked teaser (caller-provided, matches the exact visual context) instead of the real feature when locked, tappable to explain', () => {
    expect(source).toContain('<TouchableOpacity onPress={() => setInfoOpen(true)}');
    expect(source).toContain('{lockedTeaser}');
  });

  it('the popup contains the exact wording from the spec: requirement + current, a progress bar, the benefit, and an optional action button', () => {
    expect(source).toContain('Il te faut {required} {requirementLabel}. Tu en as {current}.');
    expect(source).toContain('style={[s.progressFill, { width: `${Math.round(progress * 100)}%` }]}');
    expect(source).toContain('<Text style={s.benefit}>{benefit}</Text>');
    expect(source).toContain('actionLabel && onAction ?');
  });

  it('the primary action button uses the violet primary color, never green (Design System v3)', () => {
    expect(source).toContain('actionButton: { minHeight: 46, width: \'100%\', borderRadius: 23, backgroundColor: colors.primary');
  });
});
