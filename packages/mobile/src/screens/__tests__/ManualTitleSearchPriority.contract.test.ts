import fs from 'fs';
import path from 'path';

// Adel (25/10/2026) : « il ne trouve jamais de musique quand je tape dans la barre de recherche ».
// Un titre tapé sans tiret ne doit plus être détourné vers la liste d'un artiste au nom approchant.
const source = fs.readFileSync(path.join(__dirname, '../HomeScreenCompact.tsx'), 'utf8');

describe('Trouver ta musique — priorité à la recherche titre', () => {
  it("n'affiche d'office la liste d'artiste que pour un nom exact", () => {
    expect(source).toContain('if (artist?.exactArtist && showArtist(artist)) return;');
  });

  it("essaie le titre avant l'artiste approchant", () => {
    const titleIdx = source.indexOf('if (openTemporaryMusicPreview(found, input)) return;');
    const fallbackIdx = source.indexOf('if (showArtist(artist)) return;');
    expect(titleIdx).toBeGreaterThan(0);
    expect(fallbackIdx).toBeGreaterThan(titleIdx);
  });

  it('fenêtre centrée un peu au-dessus du milieu, défilable, au-dessus du clavier', () => {
    expect(source).toMatch(/manualSearchScroll: \{ flexGrow: 1, alignItems: 'center', justifyContent: 'center'/);
    expect(source).toContain("<KeyboardAvoidingView style={s.manualSearchOverlay}");
    expect(source).not.toMatch(/manualSearchOverlay: \{[^}]*justifyContent: 'flex-start'/);
  });
});
