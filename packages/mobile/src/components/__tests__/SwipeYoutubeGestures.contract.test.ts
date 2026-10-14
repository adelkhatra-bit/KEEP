import fs from 'fs';
import path from 'path';

const deck = fs.readFileSync(path.resolve(__dirname, '..', 'MusicSwipeDeckModal.tsx'), 'utf8');

// Incident 14/10/2026 : l'iframe du fournisseur (YouTube/Spotify) recouvrait toute la carte et avalait tous les gestes ;
// les Stories défilaient seules en 2,4 s pour les titres importés via YouTube. Parcours réel : robot « swipe-stories-youtube ».
describe('Swipe : titres importés via YouTube (aperçu du profil et Stories)', () => {
  it('laisse des gouttières de geste autour du lecteur du fournisseur', () => {
    expect(deck).toContain('testID="swipe-exact-source-player" style={s.sourcePlayerOverlay} pointerEvents="box-none"');
    expect(deck).toContain('testID="swipe-source-player-frame"');
    expect(deck).toMatch(/sourcePlayerOverlay:\{[^}]*paddingHorizontal:44/);
  });

  it('ne fait pas défiler une Story toute seule quand la source officielle existe, et la propose sur appui', () => {
    expect(deck).toContain('if (sourcePlayer) return;');
    expect(deck).toContain("trackAddedAt && !sourcePlayer ? 'Extrait indisponible · Story suivante'");
    expect(deck).toContain('{!resolvedPreviewUrl && !previewResolving && sourcePlayer && !sourcePlayerOpen ? (');
    // Jamais de lecteur publicitaire automatique en Story : l'ouverture reste un appui explicite.
    expect(deck).toContain('const preferCleanStoryPlayer = true');
    expect(deck).toContain('testID="story-open-source-player"');
  });

  it('offre les flèches du clavier sur PC (← passer, → garder, ↑ suivant)', () => {
    expect(deck).toContain("event.key === 'ArrowLeft'");
    expect(deck).toContain("event.key === 'ArrowRight'");
    expect(deck).toContain("event.key === 'ArrowUp'");
    expect(deck).toContain("tag === 'input' || tag === 'textarea'");
  });
});
