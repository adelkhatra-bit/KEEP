import React, { useMemo } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import type { CanonicalTrack } from '@keep/music';
import ProfileStyleCard from './ProfileStyleCard';
import { groupEntriesByArtist } from '../services/styleGroups';

/**
 * Adel 07/10/2026 : « Quand je vais sur le profil d'un utilisateur, la liste Artistes est en vrac. Normalement elle
 * devrait être dans des dossiers, comme les autres profils. » -- l'onglet Artistes du propre profil
 * (ProfilePublicScreen) et celui d'un profil visité (PublicUserProfileScreen) passent désormais par CE SEUL composant :
 * même regroupement (groupEntriesByArtist : une carte par artiste PRINCIPAL, uniquement ses morceaux), même carte
 * premium que les Styles (ProfileStyleCard, grille 2 colonnes). Seule l'action au toucher reste propre à chaque écran
 * (Swipe de sa collection pour le propriétaire, Swipe filtré sur l'artiste pour le visiteur).
 */
export type ArtistFolderEntry = { track: CanonicalTrack; visibility?: string | null };
export type ArtistFolder<E extends ArtistFolderEntry> = { key: string; label: string; entries: E[] };

type Props<E extends ArtistFolderEntry> = {
  entries: E[];
  onOpenArtist: (folder: ArtistFolder<E>) => void;
  style?: StyleProp<ViewStyle>;
  empty?: React.ReactNode;
};

export default function ProfileArtistFolderGrid<E extends ArtistFolderEntry>({ entries, onOpenArtist, style, empty = null }: Props<E>) {
  const items = useMemo(() => groupEntriesByArtist(entries), [entries]);
  if (!items.length) return <>{empty}</>;
  // Même carte premium que les Styles (Adel 05/10/2026), un artiste = uniquement ses morceaux.
  return <View style={style}>{items.map((item, index) => {
    const publicCount = item.entries.filter((entry) => entry.visibility === 'PUBLIC').length;
    const privateCount = item.entries.length - publicCount;
    const badgeLabel = privateCount === 0 ? 'PUBLIC' : publicCount === 0 ? 'PRIVÉ' : `MIXTE · ${privateCount} PRIVÉ${privateCount > 1 ? 'S' : ''}`;
    const artworkUrl = item.entries.map((entry) => entry.track.artworkUrl).find((value): value is string => Boolean(value));
    return <ProfileStyleCard
      key={item.key}
      title={item.label}
      subtitle={`${item.entries.length} morceau${item.entries.length > 1 ? 'x' : ''}`}
      mode="PUBLIC"
      badgeLabel={badgeLabel}
      artworkUrl={artworkUrl}
      fullWidth={items.length % 2 === 1 && index === items.length - 1}
      onPress={() => onOpenArtist(item)}
      accessibilityLabel={`Écouter ${item.label}, ${item.entries.length} morceaux en Swipe`}
    />;
  })}</View>;
}
