import fs from 'fs';
import path from 'path';

const button = fs.readFileSync(path.resolve(__dirname, '..', 'TrackPreviewButton.tsx'), 'utf8');
const modal = fs.readFileSync(path.resolve(__dirname, '..', 'EmbeddedSourceModal.tsx'), 'utf8');

// Incident 14/10/2026 : le ▶ d'un titre importé via YouTube (sans extrait) ouvrait YouTube hors de Loki Music.
describe('▶ d’un titre sans extrait mais avec source officielle : lecture dans Loki Music', () => {
  it('lit la source dans l’app avant tout repli vers la plateforme', () => {
    expect(button).toContain("import { resolveEmbeddedMusicPlayer } from '../services/embeddedMusicPlayer'");
    expect(button).toContain('if (embeddableSource) { setEmbedOpen(true); return; }');
    expect(button.indexOf('if (embeddableSource) { setEmbedOpen(true); return; }')).toBeLessThan(button.indexOf('if (resolvedFallbackUrl) void openFallback();'));
    expect(button).toContain('<EmbeddedSourceModal');
    expect(button).toContain("'Écouter ce morceau dans Loki Music'");
  });

  it('réutilise le lecteur des Stories et garde « Ouvrir sur la plateforme » comme choix explicite', () => {
    expect(modal).toContain("import StoryEmbeddedSourcePlayer from './StoryEmbeddedSourcePlayer'");
    expect(modal).toContain('testID="embedded-source-modal"');
    expect(modal).toContain('testID="embedded-source-close"');
    expect(modal).toContain('Ouvrir sur la plateforme');
  });
});
