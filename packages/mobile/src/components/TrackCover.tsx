import React, { useEffect, useState } from 'react';
import { Image, StyleProp, Text, TextStyle, View, ViewStyle } from 'react-native';
import type { CanonicalTrack } from '@keep/music';
import { resolveTrackArtworkUrl } from '../services/trackPreviewResolver';

/**
 * Pochette d'un morceau. Si la reconnaissance n'a fourni aucune image, elle est cherchée par titre + artiste ;
 * tant qu'elle n'existe pas (ou si rien n'est trouvé), la pastille « K » reste affichée.
 */
export default function TrackCover({ track, style, fallbackStyle, fallbackTextStyle }: {
  track: Pick<CanonicalTrack, 'title' | 'artist' | 'artworkUrl'>;
  style: StyleProp<ViewStyle>;
  fallbackStyle: StyleProp<ViewStyle>;
  fallbackTextStyle: StyleProp<TextStyle>;
}) {
  const [resolved, setResolved] = useState<string | null>(null);
  const given = track.artworkUrl?.trim() || '';
  useEffect(() => {
    let alive = true;
    setResolved(null);
    if (given || !track.title || !track.artist) return undefined;
    void resolveTrackArtworkUrl(track).then((url) => { if (alive) setResolved(url); }).catch(() => {});
    return () => { alive = false; };
  }, [given, track.title, track.artist]);
  const uri = given || resolved;
  if (uri) return <Image source={{ uri }} style={style as any} accessibilityLabel={`Pochette de ${track.title}`} />;
  return <View style={[style, fallbackStyle]}><Text style={fallbackTextStyle}>K</Text></View>;
}
