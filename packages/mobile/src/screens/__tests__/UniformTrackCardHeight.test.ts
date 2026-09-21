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
    // (21/09/2026, révision) : la grille elle-même (hauteur fixe, troncature,
    // carrés, chevron, panneau replié par défaut) a été extraite dans
    // TrackActionRow.tsx, seule source de vérité -- déjà couverte par
    // TrackActionRow.test.ts. Ce qui reste à vérifier ici : que
    // MyMusicScreen délègue bien à ce composant plutôt que de garder sa
    // propre implémentation, et que "Donné par"/Public-Privé/Supprimer/
    // Vendre sont bien passés en `children` (donc dans le panneau), jamais
    // en dehors.
    it('delegates the row layout to TrackActionRow instead of a local implementation', () => {
      expect(myMusic).toContain("import TrackActionRow from '../components/TrackActionRow';");
      expect(myMusic).toContain('<TrackActionRow');
      expect(myMusic).toContain('playSlot={<TrackPreviewButton trackKey={track.id} previewUrl={track.previewUrl} square />}');
    });

    it('the multi-select checkbox stays outside the grid (a mode interaction, not a track action) while Play stays inside it', () => {
      const outerIdx = myMusic.indexOf('<View key={key} style={styles.trackRowOuter}>');
      const rowIdx = myMusic.indexOf('<TrackActionRow', outerIdx);
      expect(outerIdx).toBeGreaterThan(-1);
      const checkboxBlock = myMusic.slice(outerIdx, rowIdx);
      expect(checkboxBlock).toContain('selectionCheck');
    });

    it('"Donné par", Public/Privé, Supprimer and Vendre are passed as TrackActionRow children (the panel), never rendered outside it', () => {
      const rowIdx = myMusic.indexOf('<TrackActionRow');
      const closeIdx = myMusic.indexOf('</TrackActionRow>');
      expect(rowIdx).toBeGreaterThan(-1);
      expect(closeIdx).toBeGreaterThan(rowIdx);
      const childrenBlock = myMusic.slice(rowIdx, closeIdx);
      expect(childrenBlock).toContain('trackSourceRow');
      expect(childrenBlock).toContain('visibilityTrackButton');
      expect(childrenBlock).toContain('deleteTrackButton');
      expect(childrenBlock).toContain('sellTrackButton');
    });

    it('expandable is only true when there is a real local entry, and toggled through the same expandedTrackKeys state as before', () => {
      expect(myMusic).toContain('const [expandedTrackKeys, setExpandedTrackKeys] = useState<Set<string>>(new Set());');
      expect(myMusic).toContain('expandable={Boolean(localEntry)}');
      expect(myMusic).toContain('onToggleExpand={() => toggleTrackExpanded(key)}');
    });
  });
});
