// @ts-nocheck
import fs from 'fs';
import path from 'path';

// Ce fichier est stocké avec des fins de ligne CRLF ; on les normalise en LF
// pour que les assertions littérales multi-lignes restent stables quel que
// soit l'OS/checkout Git qui exécute les tests (même convention que
// KeepBattleMobileGameV3.compact.test.ts).
const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('PublicUserProfileScreen redesign (24/09/2026 : identité > collections exclusives séparées > compteurs > Styles publics > réseaux)', () => {
  const source = readNormalized(__dirname, '..', 'PublicUserProfileScreen.tsx');

  it('orders the top-level sections: identity < unified counters < exclusive collection rail < collection header < tabs < socials', () => {
    const hero = source.indexOf('<ProfileMotionReveal motionKey={`visitor-hero:${profile.id}`} delay={40} style={styles.hero}>');
    const unifiedCounters = source.indexOf('<View style={styles.topMetricsBar}');
    const boutique = source.indexOf('motionKey={`visitor-market:${profile.id}:${profileBoutiqueOffers.length}`}');
    const collectionHeader = source.indexOf('<View style={styles.collectionHeader}>');
    const tabsRow = source.indexOf('<View style={styles.tabsRow}>');
    const socialHub = source.indexOf('<View style={styles.socialHub}>');
    expect(hero).toBeGreaterThanOrEqual(0);
    expect(unifiedCounters).toBeGreaterThan(hero);
    expect(boutique).toBeGreaterThan(unifiedCounters);
    expect(collectionHeader).toBeGreaterThan(boutique);
    expect(tabsRow).toBeGreaterThan(collectionHeader);
    expect(socialHub).toBeGreaterThan(tabsRow);
  });


  it('separates exclusive collections from public Styles and keeps locked products visually distinct', () => {
    expect(source).toContain('offers={profileBoutiqueOffers}');
    // 02/10/2026 : boutique vendeur validée par Adel (SellerBoutique : Drop du moment 3 max + étagère + boutique).
    expect(source).toContain('pépite');
    expect(source).toContain('<SellerBoutique');
    expect(source).not.toContain('sale-style:');
  });

  it('uses the same action row as the owner profile (3 outline MotionActionButton) while sale collections stay separate', () => {
    expect(source).toContain('<View style={styles.ownerQuickActions}>');
    expect(source).toContain("▶ SWIPE");
    expect(source).toContain("{battleInviteBusy ? '⚡ ENVOI…' : '⚡ BATTLE'}");
    expect(source).toContain('↗ PARTAGER');
    expect(source).not.toContain('<BattleGlowButton');
    expect(source).toContain('<SellerBoutique');
    expect(source).toContain('ProfileStyleCard');
  });

  it('exposes exactly two collection tabs, Styles and Artistes -- no "Vibes" tab (no real data source for a visited stranger\'s profile)', () => {
    expect(source).toContain("type ProfileTab = 'TRACKS' | 'ARTISTS';");
    expect(source).toContain("{ key: 'TRACKS', label: 'Styles' }, { key: 'ARTISTS', label: 'Artistes' },");
    expect(source).not.toMatch(/label:\s*'Vibes'/);
  });

  it('adds a Filtrer button next to the tabs, reusing the existing style-picker modal', () => {
    expect(source).toContain("activeTab === 'TRACKS' && genreOptions.length > 0 ? (");
    expect(source).toContain('onPress={() => setStyleModalOpen(true)} accessibilityLabel={`Filtrer par style, ${genreOptions.length} disponibles`}');
    expect(source).toContain('<Text style={styles.filterButtonText}>Filtrer</Text>');
    // La modale "Parcourir par style" existante est réutilisée telle quelle, pas dupliquée.
    expect(source.match(/Parcourir par style/g)?.length).toBe(1);
  });

  it('migrates the discovery-impact display to the "1er Gardé" format, using real data only (discoveryImpacts + keptAt)', () => {
    expect(source).not.toContain("import DiscoveryImpactLabel from '../components/DiscoveryImpactLabel';");
    expect(source).not.toContain('<DiscoveryImpactLabel');
    expect(source).toContain('const isFirstKeep = directDiscovery && !!discoveryImpact && discoveryImpact.recoveryCount > 0;');
    expect(source).toContain('<Text style={styles.firstKeepBadgeText}>🥇 1er Gardé</Text>');
    expect(source).toContain('{discoveryImpact!.recoveryCount + 1} gardés');
    expect(source).toContain('a été le premier à garder ce son{daysAgo(track.keptAt) != null ? ` · il y a ${daysAgo(track.keptAt)}j` : \'\'}');
    // La donnée keptAt existe déjà côté service (loadPublicProfileKeeps), simplement mappée ici.
    expect(source).toContain('keptAt: entry.keptAt,');
  });

  it('sources the track list exclusively from loadPublicProfileKeeps -- a visitor never sees private tracks', () => {
    expect(source).toContain("const canonicalKeeps = ownerViewingSelf");
    expect(source).toContain(': await loadPublicProfileKeeps(result.id);');
    expect(source).toContain('setTracks(visible);');
    // Aucune deuxième requête ne vient élargir `tracks` avec des morceaux non publics.
    expect(source.match(/setTracks\(/g)?.length).toBe(1);
  });

  it('keeps the four counters (Abonnés/Morceaux, then Reprises/Abonnements) in one block before the collection', () => {
    const bar = source.indexOf('<View style={styles.topMetricsBar}');
    const secondary = source.indexOf('<View style={styles.topMetricsSecondary}>', bar);
    const collectionHeader = source.indexOf('<View style={styles.collectionHeader}>');
    expect(bar).toBeGreaterThan(-1);
    expect(secondary).toBeGreaterThan(bar);
    expect(secondary).toBeLessThan(collectionHeader);
    expect(source).not.toContain('visitorKeepCounters');
  });

  it('uses the KEEP violet token for "+ Suivre" (primary action), never the legacy red hex', () => {
    expect(source).not.toMatch(/followButton:\{[^}]*#FF5F83/);
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
  it('shows only Abonnés + Morceaux, with Reprises + Abonnements behind « ••• PLUS » (Adel 29/09)', () => {
    const bar = source.indexOf('<View style={styles.topMetricsBar}');
    const more = source.indexOf('style={[styles.topMetricMore', bar);
    const group = source.indexOf('<View style={styles.topMetricSocialGroup}>', more);
    const gate = source.indexOf('{countersExpanded ? (', group);
    const secondaryEnd = source.indexOf(') : null}', gate);
    expect(more).toBeGreaterThan(bar);
    expect(group).toBeGreaterThan(more);
    const main = source.slice(group, gate);
    expect(main).toContain('>Abonnés</Text>');
    expect(main).toContain('>Morceaux</Text>');
    expect(main).not.toContain('>Reprises</Text>');
    expect(main).not.toContain('>Abonnements</Text>');
    const extra = source.slice(gate, secondaryEnd);
    expect(extra).toContain('>Reprises</Text>');
    expect(extra).toContain('>Abonnements</Text>');
    expect(source).toContain('<Text style={styles.topMetricMoreText}>PLUS</Text>');
  });

  it('keeps visitor follow as a single compact action and counters on one row', () => {
    expect(source).toContain('styles.ownerQuickActions');
    expect(source).toContain('>Abonnés</Text>');
    expect(source).toContain('>Reprises</Text>');
    expect(source).toContain('>Morceaux</Text>');
    expect(source).toContain('>Abonnements</Text>');
    expect(source).not.toContain('styles.followButton');
  });

});
