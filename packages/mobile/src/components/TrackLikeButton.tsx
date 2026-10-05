import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';

/**
 * Réactions d'une musique, composant unique de l'application (Adel, 05/10/2026) : cœur ÉTEINT gris au départ, rouge quand on aime ;
 * « pas aimé » (👎) à côté. Une seule réaction par musique ; le nombre de j'aime est dans une pastille.
 */
export default function TrackLikeButton({ liked, disliked = false, count, onPress, onDislike, testID = 'deck-like-button' }: { liked: boolean; disliked?: boolean; count: number; onPress: () => void; onDislike?: () => void; testID?: string }) {
  const locked = liked || disliked;
  return (
    <View style={s.row}>
      {onDislike ? (
        <TouchableOpacity
          style={[s.button, s.buttonSmall, disliked && s.dislikeOn]}
          onPress={onDislike}
          disabled={locked}
          accessibilityRole="button"
          accessibilityState={{ selected: disliked, disabled: locked && !disliked }}
          accessibilityLabel={disliked ? 'Tu n’as pas aimé cette musique' : 'Je n’aime pas cette musique'}
          testID={`${testID}-dislike`}
        >
          <Text style={[s.dislikeIcon, disliked && s.dislikeIconOn]}>👎</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        style={[s.button, liked && s.buttonOn]}
        onPress={onPress}
        disabled={locked}
        accessibilityRole="button"
        accessibilityState={{ selected: liked, disabled: disliked }}
        accessibilityLabel={liked ? 'Tu aimes cette musique' : 'J’aime cette musique'}
        testID={testID}
      >
        <Text style={[s.heart, liked && s.heartOn]}>{liked ? '❤' : '♡'}</Text>
        {count > 0 ? <Text style={s.count} testID="deck-like-badge-count">{count}</Text> : null}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  button: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.07)', borderWidth: 1.5, borderColor: '#5B5870' },
  buttonSmall: { width: 38, height: 38, borderRadius: 19 },
  buttonOn: { backgroundColor: 'rgba(255,60,90,.22)', borderWidth: 2, borderColor: '#FF3B5C' },
  heart: { color: colors.textMuted, fontSize: 24, lineHeight: 28, fontWeight: '900' },
  heartOn: { color: '#FF2D55' },
  dislikeIcon: { fontSize: 18, lineHeight: 22, opacity: 0.55 },
  dislikeIconOn: { opacity: 1 },
  dislikeOn: { backgroundColor: 'rgba(124,92,252,.28)', borderColor: '#B79CFF', borderWidth: 2 },
  count: { position: 'absolute', right: -4, bottom: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: '#FF2D55', color: '#FFFFFF', fontSize: 11, lineHeight: 18, fontWeight: '900', textAlign: 'center', overflow: 'hidden' },
});
