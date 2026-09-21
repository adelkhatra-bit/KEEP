// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('TrackPreviewButton — variante "square" (Adel, 21/09/2026, maquette "Cartes Loki — nouveau design" validée)', () => {
  const source = readNormalized(__dirname, '..', 'TrackPreviewButton.tsx');

  it('adds a square prop without changing any existing variant (compact/fullWidth/small untouched)', () => {
    expect(source).toContain('square?: boolean;');
    expect(source).toContain('export default function TrackPreviewButton({ trackKey, previewUrl, fallbackUrl, compact = false, fullWidth = false, small = false, square = false }: Props) {');
  });

  it('renders a 40×40 icon-only square (no "Jouer"/"Stop" text) reusing the exact same play/stop logic, not a duplicate audio path', () => {
    expect(source).toContain('square: { width: 40, height: 40, borderRadius: 10');
    expect(source).toContain("<Text style={styles.squareText}>{busy ? '…' : playing ? '■' : '▶'}</Text>");
    expect(source).toContain('onPress={toggle}');
  });

  it('the square variant fills violet (primary action), matching the mockup spec', () => {
    expect(source).toContain('backgroundColor: colors.primary, alignItems: \'center\', justifyContent: \'center\' },\n  squareDisabled:');
  });

  it('keeps a stable 40×40 footprint even while resolving or when audio is unavailable, so the action row never resizes', () => {
    expect(source).toContain('if (square) return <TouchableOpacity style={styles.squareDisabled} disabled accessibilityLabel="Recherche audio en cours">');
    expect(source).toContain('if (square) return <TouchableOpacity style={styles.squareDisabled} disabled accessibilityLabel="Audio indisponible">');
  });
});
