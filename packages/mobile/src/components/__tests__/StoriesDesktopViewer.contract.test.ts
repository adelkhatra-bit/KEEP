import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.resolve(__dirname, '..', 'MusicSwipeDeckModal.tsx'), 'utf8');

// LOT 2 (11/10/2026) : sur PC, ouvrir une story bloquait l'utilisateur (lecteur écrasé à ~0 px, bouton fermer à y = -240 px).
describe('Lecteur de story sur ordinateur', () => {
  it('le lecteur a une largeur explicite et la pleine hauteur (bouton fermer toujours dans la fenêtre)', () => {
    expect(source).toMatch(/desktopPlayer:\{[^}]*width:480[^}]*alignSelf:'stretch'/);
  });
  it('clavier : Échap ferme, flèches haut/bas/droite = morceau suivant, jamais passer/garder au clavier', () => {
    expect(source).toContain("event.key === 'Escape'");
    expect(source).toContain("event.key === 'ArrowUp'");
    expect(source).not.toContain("event.key === 'ArrowLeft'");
  });
  it('bouton « Morceau suivant » pour la souris, visible seulement sur la mise en page bureau', () => {
    expect(source).toContain('loki-desktop-story-next');
  });
});
