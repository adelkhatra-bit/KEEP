import fs from 'fs';
import path from 'path';
import { formatStoryAge } from '../storyActivity';

describe('Âge d\'une story (Adel 05/10/2026)', () => {
  const now = Date.parse('2026-10-05T18:53:00Z');
  it('indique depuis quand et combien de temps encore (fenêtre 24 h)', () => {
    expect(formatStoryAge('2026-10-05T16:50:00Z', now)).toBe('il y a 2 h 03 · reste 21 h 57');
  });
  it('tombe à 0 min restant au-delà de 24 h et ignore une date invalide', () => {
    expect(formatStoryAge('2026-10-04T10:00:00Z', now)).toContain('reste 0 min');
    expect(formatStoryAge('nope', now)).toBeNull();
    expect(formatStoryAge(null, now)).toBeNull();
  });
  it('le deck affiche la ligne et ProfileStoryBar lui transmet addedAt', () => {
    const deck = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'MusicSwipeDeckModal.tsx'), 'utf8');
    const bar = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'ProfileStoryBar.tsx'), 'utf8');
    expect(deck).toContain('testID="deck-story-age"');
    expect(deck).toContain('numberOfLines={1} adjustsFontSizeToFit');
    expect(bar).toContain('trackAddedAt={openStory?.addedAt}');
  });
});

describe('Collection entière en story (Adel 05/10/2026)', () => {
  const svc = fs.readFileSync(path.join(__dirname, '..', 'musicStoriesService.ts'), 'utf8');
  it('lit toutes les musiques d\'une collection < 24 h via le serveur et les masque', () => {
    expect(svc).toContain("supabase.rpc('keep_playlist_sale_story_tracks'");
    expect(svc).toContain('MAX_COLLECTION_TRACKS_PER_STORY');
    expect(svc).toContain('mergeSaleTracks(withPins, collection, MAX_COLLECTION_TRACKS_PER_STORY)');
  });
});

describe('Collection déjà en story = bouton « + » éteint (Adel 05/10/2026)', () => {
  it('loadMyStoryTrackIds compte les titres de mes collections < 24 h', () => {
    const svc = fs.readFileSync(path.join(__dirname, '..', 'musicStoriesService.ts'), 'utf8');
    expect(svc).toContain('loadSaleCollectionStoryTracks([uid])');
  });
});

describe('Rangée de stories : ne se vide jamais + garder en public épingle (Adel 05/10/2026)', () => {
  const bar = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'ProfileStoryBar.tsx'), 'utf8');
  const deck = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'MusicSwipeDeckModal.tsx'), 'utf8');
  it('un rechargement garde les bulles affichées tant que les données ne sont pas complètes', () => {
    expect(bar).toContain('const previous = new Map(storiesRef.current.map');
    expect(bar).toContain('let degraded = false;');
    expect(bar).toContain('if (!degraded) setStories(Array.from(collected.values()));');
  });
  it('un GARDER public épingle aussi la musique (même déjà gardée avant) puis rallume le cercle', () => {
    expect(deck).toContain('void pinStoryTrack(resolveKeptTrackId(keptTrack.id))');
    expect(deck).toContain('.finally(() => notifyOwnStoryChanged())');
  });
});

describe('GARDER public d\'un morceau déjà gardé en privé (Adel 05/10/2026)', () => {
  it('rend la décision existante publique, sans débit, pour entrer en story', () => {
    const keep = fs.readFileSync(path.join(__dirname, '..', 'keepTrackAction.ts'), 'utf8');
    expect(keep).toContain("options?.visibility === 'PUBLIC' && alreadyVisibility !== 'PUBLIC'");
    expect(keep).toContain("updateKeepDecisionVisibility(existing.match.decisionId, 'PUBLIC')");
  });
});

describe('Partager en story une musique reprise + design masqué unique (Adel 05/10/2026)', () => {
  const deck = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'MusicSwipeDeckModal.tsx'), 'utf8');
  const sale = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'PlaylistSaleImmersivePreview.tsx'), 'utf8');
  it('« ajouter à ma story » sur une musique non gardée garde en Public puis épingle, et répare une garde privée', () => {
    expect(deck).toContain("void confirmKeep('PUBLIC')");
    expect(deck).toContain('STORY_PIN_REQUIRES_PUBLIC_KEEP');
  });
  it('l\'aperçu de collection utilise le même orbe animé que les stories (plus l\'ancien cadenas)', () => {
    expect(sale).toContain('<MysteryArtwork caption=""');
    expect(sale).not.toContain('s.mysteryLock');
  });
});

describe('Mémoire locale du profil : affichage instantané (Adel 05/10/2026)', () => {
  const mem = fs.readFileSync(path.join(__dirname, '..', 'profileMemory.ts'), 'utf8');
  const screen = fs.readFileSync(path.join(__dirname, '..', '..', 'screens', 'ProfilePublicScreen.tsx'), 'utf8');
  const bar = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'ProfileStoryBar.tsx'), 'utf8');
  it('la mémoire ne remplace jamais une donnée serveur : elle ne sert que si l\'état est encore vide', () => {
    expect(mem).toContain('MAX_AGE_MS = 7 * 24 * 3600 * 1000');
    expect(screen).toContain('setPublicSnapshot((previous) => previous ?? cachedPublic)');
    expect(screen).toContain("setServerOwnKeeps((previous) => (previous.length ? previous : cachedKeeps))");
  });
  it('profil et rangée de stories sont écrits en mémoire seulement avec des données serveur complètes', () => {
    expect(screen).toContain("writeProfileMemory(user.id, 'public', publicState.value)");
    expect(bar).toContain("if (!degraded) writeProfileMemory(viewer.id, 'story-rail'");
  });
});

describe('Cas teyou : épingler l\'identifiant réellement gardé + journal automatique (Adel 05/10/2026)', () => {
  const keep = fs.readFileSync(path.join(__dirname, '..', 'keepTrackAction.ts'), 'utf8');
  const report = fs.readFileSync(path.join(__dirname, '..', 'problemReportService.ts'), 'utf8');
  it('un GARDER déjà présent sous un autre identifiant (ISRC / fournisseur) épingle l\'id gardé', () => {
    expect(keep).toContain('keptTrackIdByInputId.set(track.id, existing.match.trackId)');
    expect(keep).toContain('export function resolveKeptTrackId');
  });
  it('les échecs de mise en story, de GARDER et d\'extrait laissent une trace [AUTO] sans rien demander', () => {
    expect(report).toContain('export function reportAutoDiagnostic');
    expect(report).toContain('if (seen >= 3) return;');
  });
});

describe('Ligne d\'âge de story : une seule ligne, courte (Adel 05/10/2026)', () => {
  it('ne passe jamais sur deux lignes', () => {
    const deck = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'MusicSwipeDeckModal.tsx'), 'utf8');
    expect(deck).toContain('numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} testID="deck-story-age"');
  });
});

describe('Désabonnement uniquement depuis le profil (Adel 05/10/2026)', () => {
  it('liste des vues : « Voir le profil » ; fiche rapide et listes de reprises ne désabonnent plus', () => {
    const bar = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'ProfileStoryBar.tsx'), 'utf8');
    const quick = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'SourceProfileQuickView.tsx'), 'utf8');
    const pub = fs.readFileSync(path.join(__dirname, '..', '..', 'screens', 'PublicUserProfileScreen.tsx'), 'utf8');
    const own = fs.readFileSync(path.join(__dirname, '..', '..', 'screens', 'ProfilePublicScreen.tsx'), 'utf8');
    expect(bar).toContain('story-viewer-profile-');
    expect(quick).not.toContain('.delete(');
    expect(pub).toContain("navigation.navigate('PublicProfile', { username: repriser.username }); return; }");
    expect(own).not.toContain("from('follows').delete()");
  });
});

describe('Rangée de stories : une erreur serveur n\'est plus lue comme « aucun lien » (Adel 05/10/2026)', () => {
  const svc = fs.readFileSync(path.join(__dirname, '..', 'musicStoriesService.ts'), 'utf8');
  const bar = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'ProfileStoryBar.tsx'), 'utf8');
  it('les liens indispensables en erreur lèvent l\'erreur, les bulles aussi', () => {
    expect(svc).toContain('if (followingRes.error || followersRes.error) throw (followingRes.error || followersRes.error);');
    expect(svc).toContain('if (error) throw error;');
  });
  it('une seule nouvelle tentative après 6 s et une trace [AUTO], jamais de boucle', () => {
    expect(bar).toContain('if (degraded && attempt === 0 && live) retryTimer = setTimeout(() => { if (live) void run(1); }, 6000);');
    expect(bar).toContain("reportAutoDiagnostic('STORY_RELATIONS_FAILED', error)");
  });
});

describe('Créateur identifié + rafraîchissement des bulles (Adel 05/10/2026)', () => {
  const bar = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'ProfileStoryBar.tsx'), 'utf8');
  const keep = fs.readFileSync(path.join(__dirname, '..', 'lokiPulseKeep.ts'), 'utf8');
  it('un GARDER depuis une story enregistre le propriétaire de la story comme source', () => {
    expect(keep).toContain("source: 'story'");
    expect(keep).toContain('sourceProfileId: from.profileId');
  });
  it('la rangée se recharge en direct (Realtime), au retour dans l\'app et toutes les 90 s, au plus 1 fois / 5 s', () => {
    expect(bar).toContain("table: 'story_pins'");
    expect(bar).toContain('setInterval(bump, 90000)');
    expect(bar).toContain('if (now - lastBumpRef.current < 5000) return;');
    expect(bar).toContain("state === 'active'");
  });
});

describe('Lecteur de story minimal (Adel 05/10/2026)', () => {
  const bar = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'ProfileStoryBar.tsx'), 'utf8');
  const deck = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'MusicSwipeDeckModal.tsx'), 'utf8');
  it('plus de phrase d\'accroche ni de sous-titre sur la story d\'un autre ; le coût est sur GARDER', () => {
    expect(bar).toContain("subtitle={isOwnOpen ? 'Tes musiques partagées ou en vente' : undefined}");
    expect(deck).toContain('→ garder${keepDebitAmount && keepDebitAmount > 0 ? ` · ${keepDebitAmount} FREE` : \'\'}');
  });
  it('indications courtes', () => {
    expect(deck).toContain('↑ suivant · ← passer · → garder');
    expect(deck).toContain("'↑ suivant · ← passer'");
    expect(deck).toContain("'✓ DÉJÀ EN STORY'");
  });
});
