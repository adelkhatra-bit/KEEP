import { MusicRecognitionProvider } from './MusicRecognitionProvider';
import { RecognitionResult } from '../types';

const DEMO_CATALOG: RecognitionResult[] = [
  { confidence: 0.97, title: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours', isrc: 'USUG11904206' },
  { confidence: 0.94, title: 'Heat Waves', artist: 'Glass Animals', album: 'Dreamland', isrc: 'GBUM71903306' },
  { confidence: 0.91, title: 'As It Was', artist: 'Harry Styles', album: "Harry's House", isrc: 'USSM12200612' },
];

/**
 * DEMO uniquement — retourne un morceau du catalogue fictif de façon
 * pseudo-aléatoire. Ne fait aucune analyse audio réelle. Doit être remplacé
 * par un provider réel (AudD/ACRCloud, voir docs/MUSIC_RECOGNITION_PROVIDERS.md)
 * avant tout usage en Mode Réel.
 */
export class DemoRecognitionProvider implements MusicRecognitionProvider {
  readonly providerId = 'demo';

  async recognize(_audioSample: ArrayBuffer | Blob): Promise<RecognitionResult | null> {
    const pick = DEMO_CATALOG[Math.floor(Math.random() * DEMO_CATALOG.length)];
    return pick;
  }
}
