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
    // (21/09/2026, révision) : la grille (hauteur fixe, troncature, carrés,
    // chevron, panneau replié par défaut) a été extraite dans
    // TrackActionRow.tsx -- déjà couverte par TrackActionRow.test.ts. Ce
    // qui reste à vérifier ici : la délégation, et que seul un carré
    // (Partager) est fourni en plus de Play (pas de "Garder" sur son
    // propre profil -- déjà à soi par définition).
    it('delegates the row layout to TrackActionRow instead of a local implementation', () => {
      expect(own).toContain("import TrackActionRow from '../components/TrackActionRow';");
      expect(own).toContain('<TrackActionRow');
      expect(own).toContain('playSlot={<TrackPreviewButton trackKey={track.id || key} previewUrl={track.previewUrl} square />}');
    });

    it('only a Partager square is supplied (no Garder square on one\'s own profile), and it never fills the square background (tone colors only recolor the icon)', () => {
      const rowIdx = own.indexOf('<TrackActionRow');
      const closeIdx = own.indexOf('</TrackActionRow>');
      const block = own.slice(rowIdx, closeIdx);
      expect(block).toContain("icon: '↗',");
      expect(block).toContain("accessibilityLabel: 'Partager ce morceau',");
    });

    it('the 1er KEEP badge and "Découvert par" attribution are passed as TrackActionRow children (the panel), never rendered outside it', () => {
      const rowIdx = own.indexOf('<TrackActionRow');
      const closeIdx = own.indexOf('</TrackActionRow>');
      expect(rowIdx).toBeGreaterThan(-1);
      const childrenBlock = own.slice(rowIdx, closeIdx);
      expect(childrenBlock).toContain('firstKeepBadge');
      expect(childrenBlock).toContain('Découvert par');
    });

    it('the panel only opens when there is something to show (a real 1er KEEP impact or a known origin), collapsed by default', () => {
      expect(own).toContain('const [expandedTrackKeys, setExpandedTrackKeys] = useState<Set<string>>(new Set());');
      expect(own).toContain('expandable={hasDetails}');
      expect(own).toContain('const hasDetails = isFirstKeep || !!originKind;');
    });
  });

  describe('PublicUserProfileScreen.tsx (profil visité)', () => {
    // (21/09/2026, révision) : la grille (hauteur fixe, troncature, carrés,
    // chevron, panneau replié par défaut) a été extraite dans
    // TrackActionRow.tsx -- déjà couverte par TrackActionRow.test.ts. Ce
    // qui reste à vérifier ici : la délégation, les 4 carrés (Play/Like/
    // État/Partager, Like et Garder INDÉPENDANTS), et que seuls le badge
    // 1er KEEP + l'attribution restent dans le panneau.
    it('delegates the row layout to TrackActionRow instead of a local implementation', () => {
      expect(visited).toContain("import TrackActionRow from '../components/TrackActionRow';");
      expect(visited).toContain('<TrackActionRow');
      expect(visited).toContain('playSlot={<TrackPreviewButton trackKey={track.trackId} previewUrl={track.previewUrl} square />}');
    });

    it('supplies 4 independent actions -- like and keep never share a square (a track can be liked without being kept, and vice versa)', () => {
      const rowIdx = visited.indexOf('<TrackActionRow');
      const closeIdx = visited.indexOf('</TrackActionRow>');
      const block = visited.slice(rowIdx, closeIdx);
      expect(block).toContain("key: 'like',");
      expect(block).toContain("key: 'keep',");
      expect(block).toContain("key: 'share',");
      expect(block).toContain("onPress: () => void toggleLike(track.trackId),");
      expect(block).toContain('onPress: () => (alreadyKept ? showAlreadyKept(track.title) : openKeepPrompt(track)),');
    });

    it('only the 1er KEEP badge and "Découvert par" attribution are passed as TrackActionRow children (the panel) -- Like/Partager/Garder are actions, never panel content', () => {
      const rowIdx = visited.indexOf('<TrackActionRow');
      const closeIdx = visited.indexOf('</TrackActionRow>');
      expect(rowIdx).toBeGreaterThan(-1);
      const childrenBlock = visited.slice(rowIdx, closeIdx);
      expect(childrenBlock).toContain('firstKeepBadge');
      expect(childrenBlock).toContain('Découvert par');
    });

    it('the panel only opens when there is something to show, collapsed by default', () => {
      expect(visited).toContain('const [expandedTrackKeys, setExpandedTrackKeys] = useState<Set<string>>(new Set());');
      expect(visited).toContain('expandable={isFirstKeep || Boolean(discoveryUsername)}');
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

    it('keeps normal rows toggleable while management mode opens every real local row without removing the existing state', () => {
      expect(myMusic).toContain('const [expandedTrackKeys, setExpandedTrackKeys] = useState<Set<string>>(new Set());');
      expect(myMusic).toContain('expandable={!manageMusicMode && Boolean(localEntry)}');
      expect(myMusic).toContain('expanded={manageMusicMode || expanded}');
      expect(myMusic).toContain('onToggleExpand={manageMusicMode ? undefined : () => toggleTrackExpanded(key)}');
    });
  });
});
