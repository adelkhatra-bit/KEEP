// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

/**
 * Adel (21/09/2026) : "Design incohérent de la liste des morceaux --
 * hauteurs variables + surcharge d'informations." Vérifie, par lecture de
 * source (aucun harnais de rendu React Native n'est configuré dans ce
 * dépôt -- voir la note dans le commit qui a introduit ce fichier), que :
 * 1) la rangée principale a une hauteur fixe et ne contient plus rien de
 *    variable (badges, lignes d'attribution) ;
 * 2) titre/artiste sont tronqués sur une seule ligne, jamais multi-ligne ;
 * 3) tout le reste vit dans un panneau dépliable, replié par défaut.
 */
describe('Cartes de morceaux -- hauteur fixe + panneau dépliable (ProfilePublicScreen + PublicUserProfileScreen)', () => {
  const own = readNormalized(__dirname, '..', 'ProfilePublicScreen.tsx');
  const visited = readNormalized(__dirname, '..', 'PublicUserProfileScreen.tsx');
  const myMusic = readNormalized(__dirname, '..', 'MyMusicScreen.tsx');

  describe('ProfilePublicScreen.tsx (propre profil)', () => {
    it('the main row has an explicit fixed height, not derived from content', () => {
      expect(own).toContain("keepRow:{flexDirection:'row',alignItems:'center',height:64,paddingHorizontal:8,gap:8}");
    });

    it('title and artist are single-line, truncated with an ellipsis, never wrapping', () => {
      expect(own).toContain('<Text style={s.keepTitle} numberOfLines={1}>{track.title}</Text>');
      expect(own).toContain('<Text style={s.keepArtist} numberOfLines={1}>{track.artist}</Text>');
    });

    it('the 1er KEEP badge and "Découvert par" attribution never render inside the fixed-height row -- only inside the collapsible panel', () => {
      const rowBlock = own.slice(own.indexOf('<View style={[s.keepRow'), own.indexOf('{expanded ? ('));
      expect(rowBlock).not.toContain('firstKeepBadge');
      expect(rowBlock).not.toContain('Découvert par');
      const panelBlock = own.slice(own.indexOf('{expanded ? ('), own.indexOf('{expanded ? (') + 2500);
      expect(panelBlock).toContain('firstKeepBadge');
      expect(panelBlock).toContain('Découvert par');
    });

    it('the panel is collapsed by default (a Set of expanded keys, empty on mount) and toggled by a chevron, not shown automatically', () => {
      expect(own).toContain('const [expandedTrackKeys, setExpandedTrackKeys] = useState<Set<string>>(new Set());');
      expect(own).toContain("<Text style={s.expandToggleText}>{expanded ? '⌃' : '⌄'}</Text>");
    });

    it('play and share are always-visible 40×40 squares in the fixed row (revised 21/09/2026, maquette "Cartes Loki — nouveau design" validée)', () => {
      const rowBlock = own.slice(own.indexOf('<View style={[s.keepRow'), own.indexOf('{expanded ? ('));
      expect(rowBlock).toContain('<TrackPreviewButton trackKey={track.id || key} previewUrl={track.previewUrl} square />');
      expect(rowBlock).toContain('s.squareShare');
    });
  });

  describe('PublicUserProfileScreen.tsx (profil visité)', () => {
    it('the main row has an explicit fixed height, not derived from content', () => {
      expect(visited).toContain("musicRow:{flexDirection:'row',alignItems:'center',height:64,paddingHorizontal:9,gap:8}");
    });

    it('title and artist are single-line, truncated with an ellipsis, never wrapping', () => {
      expect(visited).toContain('<Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>');
      expect(visited).toContain('<Text style={styles.trackArtist} numberOfLines={1}>{track.artist}</Text>');
    });

    it('only the 1er KEEP badge and "Découvert par" attribution stay in the collapsible panel -- never in the fixed row (revised 21/09/2026, maquette "Cartes Loki — nouveau design" validée : Like/Partager ne doivent plus jamais exiger un déplié)', () => {
      const rowBlock = visited.slice(visited.indexOf('<View style={styles.musicRow}>'), visited.indexOf('{trackExpanded ? ('));
      expect(rowBlock).not.toContain('firstKeepBadge');
      expect(rowBlock).not.toContain('Découvert par');
      const panelBlock = visited.slice(visited.indexOf('{trackExpanded ? ('), visited.indexOf('{trackExpanded ? (') + 2000);
      expect(panelBlock).toContain('firstKeepBadge');
      expect(panelBlock).toContain('Découvert par');
      expect(panelBlock).not.toContain('squareLike');
      expect(panelBlock).not.toContain('squareShare');
    });

    it('the panel is collapsed by default and toggled by a chevron, not shown automatically', () => {
      expect(visited).toContain('const [expandedTrackKeys, setExpandedTrackKeys] = useState<Set<string>>(new Set());');
      expect(visited).toContain("<Text style={styles.expandToggleText}>{trackExpanded ? '⌃' : '⌄'}</Text>");
    });

    it('play, like, share and keep are always-visible 40×40 squares in the fixed row, never behind the chevron', () => {
      const rowBlock = visited.slice(visited.indexOf('<View style={styles.musicRow}>'), visited.indexOf('{trackExpanded ? ('));
      expect(rowBlock).toContain('<TrackPreviewButton trackKey={track.trackId} previewUrl={track.previewUrl} square />');
      expect(rowBlock).toContain('styles.squareLike');
      expect(rowBlock).toContain('styles.squareShare');
      expect(rowBlock).toContain('styles.squareKeep');
    });
  });

  describe('MyMusicScreen.tsx (bibliothèque personnelle -- "et partout où ce type de liste existe")', () => {
    it('the main row has an explicit fixed height, not derived from content', () => {
      expect(myMusic).toContain("trackRow:{height:56,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:6}");
    });

    it('title and artist are single-line, truncated with an ellipsis, never wrapping', () => {
      expect(myMusic).toContain('<Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>');
      expect(myMusic).toContain('<Text style={styles.trackArtist} numberOfLines={1}>{track.artist}</Text>');
    });

    it('"Donné par", Public/Privé, Supprimer and Vendre never render inside the fixed-height row -- only inside the collapsible panel (the multi-select checkbox and the play button stay, they are direct interactions, not meta-info)', () => {
      const rowBlock = myMusic.slice(myMusic.indexOf('<View style={styles.trackRow}>'), myMusic.indexOf('{expanded && localEntry ? ('));
      expect(rowBlock).not.toContain('trackSourceRow');
      expect(rowBlock).not.toContain('visibilityTrackButton');
      expect(rowBlock).not.toContain('deleteTrackButton');
      expect(rowBlock).not.toContain('sellTrackButton');
      const panelBlock = myMusic.slice(myMusic.indexOf('{expanded && localEntry ? ('), myMusic.indexOf('{expanded && localEntry ? (') + 3500);
      expect(panelBlock).toContain('trackSourceRow');
      expect(panelBlock).toContain('visibilityTrackButton');
      expect(panelBlock).toContain('deleteTrackButton');
      expect(panelBlock).toContain('sellTrackButton');
    });

    it('the panel is collapsed by default and toggled by a chevron, not shown automatically', () => {
      expect(myMusic).toContain('const [expandedTrackKeys, setExpandedTrackKeys] = useState<Set<string>>(new Set());');
      expect(myMusic).toContain("<Text style={styles.expandToggleText}>{expanded ? '⌃' : '⌄'}</Text>");
    });
  });
});
