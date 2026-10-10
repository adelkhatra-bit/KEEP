jest.mock('../supabaseClient', () => ({ supabase: null }));
import fs from 'fs';
import path from 'path';
import { hasFreshSaleOffer } from '../musicStoriesService';

describe('Story 24 h : la boutique ne rallume plus la story indéfiniment (Adel 10/10/2026)', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  it('offre de plus de 24 h = pas de carte boutique en story', () => {
    expect(hasFreshSaleOffer([{ createdAt: '2026-09-29T00:43:11Z' }, { createdAt: '2026-10-02T10:56:28Z' }], now)).toBe(false);
    expect(hasFreshSaleOffer([{ createdAt: '2026-10-02T10:56:28Z' }, { createdAt: '2026-10-10T08:00:00Z' }], now)).toBe(true);
    expect(hasFreshSaleOffer(undefined, now)).toBe(false);
    expect(hasFreshSaleOffer([{}], now)).toBe(false);
  });
  it('appliqué aux stories suivies, à ma story, et purge minute par minute', () => {
    const svc = fs.readFileSync(path.join(__dirname, '..', 'musicStoriesService.ts'), 'utf8');
    expect(svc).toContain("hasFreshSaleOffer(offersBySeller.get(story.profileId))");
    expect(svc).toContain('hasFreshSaleOffer(offersBySeller.get(id))');
    const bar = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'ProfileStoryBar.tsx'), 'utf8');
    expect(bar).toContain('}, 60000);');
    expect(bar).toContain('pruneExpiredStory(story)');
  });
});

describe('Garde générale : aucune source de story sans limite de 24 h (nouveaux utilisateurs compris)', () => {
  const svc = fs.readFileSync(path.join(__dirname, '..', 'musicStoriesService.ts'), 'utf8');
  it('chaque usage du sampler de boutique est conditionné à une offre fraîche', () => {
    const uses = svc.split('\n').filter((line) => line.includes('loadPlaylistSaleProfilePreviewSampler(') && !line.includes('import'));
    expect(uses.length).toBeGreaterThanOrEqual(3);
    const fresh = (svc.match(/hasFreshSaleOffer\(/g) || []).length;
    expect(fresh).toBeGreaterThanOrEqual(uses.length + 1); // +1 = définition
  });
  it('toutes les requêtes de pins / partages de story filtrent sur la fenêtre de 24 h', () => {
    expect(svc).toContain("gte('pinned_at', since)");
    expect(svc).toContain("gte('created_at', since)");
    expect(svc).toContain('STORY_WINDOW_HOURS * 3600 * 1000');
  });
});

describe('Mettre en story : réponse immédiate, une seule fenêtre par tap (Adel, 10/10/2026 : « ça rame », popups derrière)', () => {
  const deck = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'MusicSwipeDeckModal.tsx'), 'utf8');
  it('le contrôle anti-doublon est préchargé à l’ouverture, pas attendu au tap', () => {
    expect(deck).toContain('setHoldersById');
    expect(deck).toContain('holdersById[resolveKeptTrackId(current.id)]');
    const start = deck.indexOf('const addCurrentToStory');
    expect(deck.slice(start, start + 3000)).not.toContain('await loadOtherStoryHolders');
  });
  it('un tap ouvre une seule confirmation (garde anti double tap)', () => {
    expect(deck).toContain('addingRef.current = true');
    expect(deck).toContain('if (addingRef.current) return;');
  });
  it('musique de MA boutique : passe par keep_pin_story_track (accepté sans migration), pas par le chemin gratuit refusé', () => {
    const start = deck.indexOf('const shareFreeToStory');
    const block = deck.slice(start, start + 900);
    expect(block).toContain('offeredIds.has(track.id)');
    expect(block).toContain('await pinStoryTrack(track.id)');
  });
});

describe('Messagerie plein écran : toujours un bouton « Fermer la messagerie » (CI dual-viewport, 10/10/2026)', () => {
  const agora = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'MusicAgoraPanel.tsx'), 'utf8');
  it('la boîte de messages (sans conversation ouverte) a son bouton de fermeture', () => {
    expect(agora).toContain('testID="chat-inbox-close"');
    expect(agora).toContain('accessibilityLabel="Fermer la messagerie"');
  });
});
