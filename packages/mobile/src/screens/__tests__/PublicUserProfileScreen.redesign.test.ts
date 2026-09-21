// @ts-nocheck
import fs from 'fs';
import path from 'path';

// Ce fichier est stocké avec des fins de ligne CRLF ; on les normalise en LF
// pour que les assertions littérales multi-lignes restent stables quel que
// soit l'OS/checkout Git qui exécute les tests (même convention que
// KeepBattleMobileGameV3.compact.test.ts).
const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('PublicUserProfileScreen redesign (Adel, 21/09/2026 : plan validé -- identité > compteurs regroupés > Ma collection > boutique > réseaux)', () => {
  const source = readNormalized(__dirname, '..', 'PublicUserProfileScreen.tsx');

  it('orders the top-level sections: identity < unified counters < collection header < tabs < boutique < socials', () => {
    const hero = source.indexOf('<View style={styles.hero}>');
    const unifiedCounters = source.indexOf('<View style={styles.unifiedCounters}>');
    const collectionHeader = source.indexOf('<View style={styles.collectionHeader}>');
    const tabsRow = source.indexOf('<View style={styles.tabsRow}>');
    const boutique = source.indexOf("<Text style={styles.sectionTitle}>Boutique playlists</Text>");
    const socialHub = source.indexOf('<View style={styles.socialHub}>');
    expect(hero).toBeGreaterThanOrEqual(0);
    expect(unifiedCounters).toBeGreaterThan(hero);
    expect(collectionHeader).toBeGreaterThan(unifiedCounters);
    expect(tabsRow).toBeGreaterThan(collectionHeader);
    expect(boutique).toBeGreaterThan(tabsRow);
    expect(socialHub).toBeGreaterThan(boutique);
  });

  it('exposes exactly two collection tabs, Musiques and Artistes -- no "Vibes" tab (no real data source for a visited stranger\'s profile)', () => {
    expect(source).toContain("type ProfileTab = 'TRACKS' | 'ARTISTS';");
    expect(source).toContain("{ key: 'TRACKS', label: 'Musiques' }, { key: 'ARTISTS', label: 'Artistes' },");
    expect(source).not.toMatch(/label:\s*'Vibes'/);
  });

  it('adds a Filtrer button next to the tabs, reusing the existing style-picker modal', () => {
    expect(source).toContain("activeTab === 'TRACKS' && genreOptions.length > 0 ? (");
    expect(source).toContain('onPress={() => setStyleModalOpen(true)} accessibilityLabel={`Filtrer par style, ${genreOptions.length} disponibles`}');
    expect(source).toContain('<Text style={styles.filterButtonText}>Filtrer</Text>');
    // La modale "Parcourir par style" existante est réutilisée telle quelle, pas dupliquée.
    expect(source.match(/Parcourir par style/g)?.length).toBe(1);
  });

  it('migrates the discovery-impact display to the "1er KEEP" format, using real data only (discoveryImpacts + keptAt)', () => {
    expect(source).not.toContain("import DiscoveryImpactLabel from '../components/DiscoveryImpactLabel';");
    expect(source).not.toContain('<DiscoveryImpactLabel');
    expect(source).toContain('const isFirstKeep = directDiscovery && !!discoveryImpact && discoveryImpact.recoveryCount > 0;');
    expect(source).toContain('<Text style={styles.firstKeepBadgeText}>🥇 1er KEEP</Text>');
    expect(source).toContain('{discoveryImpact!.recoveryCount + 1} KEEPs');
    expect(source).toContain('a été le premier à KEEP ce son{daysAgo(track.keptAt) != null ? ` · il y a ${daysAgo(track.keptAt)}j` : \'\'}');
    // La donnée keptAt existe déjà côté service (loadPublicProfileKeeps), simplement mappée ici.
    expect(source).toContain('keptAt: entry.keptAt,');
  });

  it('sources the track list exclusively from loadPublicProfileKeeps -- a visitor never sees private tracks', () => {
    expect(source).toContain('const canonicalKeeps = await loadPublicProfileKeeps(result.id);');
    expect(source).toContain('setTracks(visible);');
    // Aucune deuxième requête ne vient élargir `tracks` avec des morceaux non publics.
    expect(source.match(/setTracks\(/g)?.length).toBe(1);
  });

  it('groups the four counters (Abonnés/Reprises/Morceaux/Abonnements) into one contiguous block', () => {
    const unifiedCounters = source.indexOf('<View style={styles.unifiedCounters}>');
    const collectionHeader = source.indexOf('<View style={styles.collectionHeader}>');
    const connectionsRow = source.indexOf("<ProfileCounterRow kind=\"connections\"", unifiedCounters);
    const keepsRow = source.indexOf("<ProfileCounterRow kind=\"keeps\"", unifiedCounters);
    expect(connectionsRow).toBeGreaterThan(unifiedCounters);
    expect(keepsRow).toBeGreaterThan(connectionsRow);
    expect(keepsRow).toBeLessThan(collectionHeader);
    // Un seul bloc "unifiedCounters" au total (pas de second visitorKeepCounters séparé).
    expect(source).not.toContain('visitorKeepCounters');
  });

  it('uses the KEEP violet token for "+ Suivre" (primary action), never the legacy red hex', () => {
    expect(source).toContain("followButton:{minHeight:32,paddingHorizontal:12,borderRadius:16,backgroundColor:colors.primary,borderWidth:1.5,borderColor:colors.primary");
    expect(source).not.toMatch(/followButton:\{[^}]*#FF5F83/);
    expect(source).toContain('followButtonActive:{backgroundColor:colors.backgroundElevated,borderColor:colors.border}');
  });

  it('uses the KEEP violet token for the marketplace price button, not green (Design System: green is reserved for success/validation)', () => {
    expect(source).toContain('marketplacePriceButton:{minWidth:56,minHeight:34,paddingHorizontal:9,borderRadius:17,backgroundColor:colors.primary');
    expect(source).not.toMatch(/marketplacePriceButton:\{[^}]*#38D990/);
  });

  it('removes the duplicate full-width Swipe banner -- the compact SWIPE button in identity already does the same action', () => {
    expect(source).not.toContain('DÉCOUVRIR SA COLLECTION EN SWIPE');
    expect(source).not.toContain('swipeLaunch');
  });

  it('removes the "PAR ARTISTE" button and its modal -- replaced by the Artistes tab (same artistGroups data, same filtered-Swipe action)', () => {
    expect(source).not.toContain('prefsSummaryLabel}>PAR ARTISTE');
    expect(source).not.toContain('artistModalOpen');
    expect(source).not.toContain('Parcourir par artiste');
    expect(source).toContain("openBrowseSwipe({ type: 'artist', value: group.key, label: group.name })");
  });

  it('keeps every icon-only touch target at the 44x44 accessibility minimum (back, moderation/share, social icons)', () => {
    expect(source).toContain('back:{width:44,height:44,color:colors.textPrimary');
    expect(source).toContain("shareTopButton:{width:44,height:44,borderRadius:22,backgroundColor:colors.primary");
    expect(source).toContain("socialButton:{flex:1,maxWidth:46,height:44,borderRadius:22");
  });
});
