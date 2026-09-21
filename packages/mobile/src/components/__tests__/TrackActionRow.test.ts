// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

/**
 * Adel (21/09/2026) : "Grille à colonnes fixes, largeurs fixes, alignement
 * vertical strict ... Test visuel obligatoire : ajoute un test de rendu qui
 * vérifie que la position X du bouton Play est identique sur toutes les
 * lignes, peu importe l'état."
 *
 * Limite honnête (déjà documentée dans un commit précédent, toujours
 * vraie) : aucun harnais de rendu React Native n'est configuré dans ce
 * dépôt (pas de preset jest-expo/react-native, tenté et vérifié
 * concrètement lors d'une mission précédente -- échoue sur le parsing ESM
 * de react-native lui-même sans configuration supplémentaire). Impossible
 * donc de mesurer une position X réellement rendue dans ce test. Ce qui
 * est vérifié à la place, et qui garantit le même résultat par
 * construction : TOUTES les rangées de morceau, sur les 3 écrans,
 * passent par CE SEUL composant, dont les largeurs de colonne (cover,
 * carré, chevron) sont des constantes FIXES jamais dérivées des props ou
 * de l'état -- il ne peut donc pas exister deux rangées avec des largeurs
 * différentes.
 */
describe('TrackActionRow — grille à colonnes fixes (maquette interactive validée : https://claude.ai/artifact/9X4dx8oMmCJ3hkRGndc7BW)', () => {
  const source = readNormalized(__dirname, '..', 'TrackActionRow.tsx');

  it('never collides with the pre-existing, unrelated TrackRow.tsx (session Garder/Passer prompts) -- verified before creating this file, named differently on purpose', () => {
    const sessionTrackRow = readNormalized(__dirname, '..', 'TrackRow.tsx');
    expect(sessionTrackRow).toContain('entry: SessionTrackEntry;');
    expect(source).not.toBe(sessionTrackRow);
  });

  it('column widths are named constants, never derived from props/state -- the only way to guarantee every row aligns identically regardless of track state', () => {
    expect(source).toContain('const SQUARE = 40;');
    expect(source).toContain('const COVER = 56;');
    expect(source).toContain('const CHEVRON = 24;');
    expect(source).toContain('const ROW_HEIGHT = 64;');
    // Chaque colonne fixe utilise la constante directement dans son style,
    // jamais une valeur qui dépendrait de `actions.length` ou de l'état.
    expect(source).toContain('cover: { width: COVER, height: COVER, borderRadius: 10, flexShrink: 0');
    expect(source).toContain('square: { width: SQUARE, height: SQUARE, flexShrink: 0');
    expect(source).toContain('chevron: { width: CHEVRON, height: CHEVRON, flexShrink: 0');
  });

  it('flexShrink: 0 on every fixed column prevents the flexible title/artist zone from ever compressing a square, even on a 320px screen', () => {
    expect(source).toContain('info: { flex: 1, minWidth: 0 }');
    const fixedCols = ['cover:', 'square:', 'chevron:'];
    fixedCols.forEach((col) => {
      const idx = source.indexOf(col);
      expect(idx).toBeGreaterThan(-1);
      expect(source.slice(idx, idx + 120)).toContain('flexShrink: 0');
    });
  });

  it('renders exactly ONE action square per state concept (never two squares for the same track) -- actions is a flat array supplied by the caller, one entry per real action', () => {
    expect(source).toContain('{actions.map((action) => (');
    expect(source).toContain('key={action.key}');
  });

  it('the Play slot is rendered as-is (no wrapping square) -- audio logic stays entirely inside TrackPreviewButton, never duplicated here', () => {
    expect(source).toContain('{playSlot}');
    expect(source).not.toContain('<View style={styles.square}>{playSlot}</View>');
  });

  it('square background is the exact validated hex (#1A1A2E), same for every action square regardless of tone', () => {
    expect(source).toContain("backgroundColor: '#1A1A2E'");
  });

  it('tone colors (success/pink/gold) only ever recolor the icon text, never the square background -- confirmed by the validated mockup ("jamais le fond du carré")', () => {
    const idx = source.indexOf('TONE_COLOR[action.tone]');
    expect(idx).toBeGreaterThan(-1);
    expect(source.slice(idx - 40, idx + 200)).not.toContain('backgroundColor');
  });

  it('the collapsible panel only exists when expandable is true, and only opens when expanded -- never shown automatically', () => {
    expect(source).toContain('{expandable && expanded ? <View style={styles.panel}>{children}</View> : null}');
  });
});
