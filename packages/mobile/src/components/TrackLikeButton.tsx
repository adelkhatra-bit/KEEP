import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import GlowRing from './GlowRing';

/** Cœur « j'aime » unique de l'application (Adel, 05/10/2026) : contour rose qui pulse tant que la musique n'est pas aimée, cœur rouge une fois aimé, nombre de j'aime dans une pastille. */
export default function TrackLikeButton({ liked, count, onPress, testID = 'deck-like-button' }: { liked: boolean; count: number; onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity
      style={[s.button, liked && s.buttonOn]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: liked }}
      accessibilityLabel={liked ? 'Tu aimes cette musique' : 'J’aime cette musique'}
      testID={testID}
    >
      {!liked ? <GlowRing radius={22} color="#FF5C8A" testID="deck-like-glow" /> : null}
      <Text style={[s.heart, liked && s.heartOn]}>{liked ? '❤' : '♡'}</Text>
      {count > 0 ? <Text style={s.count} testID="deck-like-badge-count">{count}</Text> : null}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  button: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,92,138,.12)' },
  buttonOn: { backgroundColor: 'rgba(255,60,90,.22)', borderWidth: 2, borderColor: '#FF3B5C' },
  heart: { color: '#FF5C8A', fontSize: 24, lineHeight: 28, fontWeight: '900' },
  heartOn: { color: '#FF2D55' },
  count: { position: 'absolute', right: -4, bottom: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: '#FF2D55', color: '#FFFFFF', fontSize: 11, lineHeight: 18, fontWeight: '900', textAlign: 'center', overflow: 'hidden' },
});
