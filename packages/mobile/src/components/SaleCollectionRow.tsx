import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';

// Adel (29/09/2026) : « le design est vraiment trop gros… imagine-toi que
// demain on a plus de 5 millions d'utilisateurs ». Une collection en vente =
// UNE ligne compacte (≈ 64 px) au lieu d'une grande carte de 260 px : un
// vendeur avec 3 ou 300 collections reste lisible, la liste se déroule par
// paquets (voir PublicUserProfileScreen), et la même ligne sert partout.

const GRADIENTS: [string, string][] = [
  ['#2DE1C2', '#7C5CFC'],
  ['#7C5CFC', '#FF5C72'],
  ['#FFB454', '#7C5CFC'],
  ['#4A90E2', '#2DE1C2'],
];

type Props = {
  index: number;
  title: string;
  meta: string;
  // Prix (« 3 FREE », « 2,99€ ») ou statut (« ✓ DÉBLOQUÉE »).
  tag: string;
  tagTone?: 'price' | 'free' | 'money' | 'unlocked';
  onPress: () => void;
  accessibilityLabel: string;
  onPlayPress?: () => void;
  playAccessibilityLabel?: string;
};

export default function SaleCollectionRow({ index, title, meta, tag, tagTone = 'price', onPress, accessibilityLabel, onPlayPress, playAccessibilityLabel }: Props) {
  const gradient = GRADIENTS[index % GRADIENTS.length];
  const isFree = tagTone === 'free' || tagTone === 'price';
  const isMoney = tagTone === 'money';
  const isUnlocked = tagTone === 'unlocked';
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [s.row, pressed && s.rowPressed]}>
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cover}>
        <Text style={s.coverIcon}>◆</Text>
      </LinearGradient>
      <View style={s.copy}>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        <Text style={s.meta} numberOfLines={1}>{meta}</Text>
      </View>
      <View style={[s.tag, isFree && s.tagFree, isMoney && s.tagMoney, isUnlocked && s.tagUnlocked]}>
        <Text style={[s.tagText, isFree && s.tagTextFree, isMoney && s.tagTextMoney, isUnlocked && s.tagTextUnlocked]} numberOfLines={1}>{tag}</Text>
      </View>
      {onPlayPress ? (
        <Pressable onPress={onPlayPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={playAccessibilityLabel || `Écouter ${title}`} style={({ pressed }) => [s.play, pressed && s.rowPressed]}>
          <Text style={s.playIcon}>▶</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 16, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border },
  rowPressed: { opacity: .75 },
  cover: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  coverIcon: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  copy: { flex: 1, minWidth: 0 },
  title: { color: colors.textPrimary, fontSize: 15, lineHeight: 19, fontWeight: '900' },
  meta: { color: colors.textMutedGrey, fontSize: 12, lineHeight: 16, fontWeight: '700', marginTop: 2 },
  tag: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 11, borderWidth: 1, maxWidth: 110, minWidth: 58, alignItems: 'center', justifyContent: 'center' },
  tagFree: { backgroundColor: 'rgba(45,225,194,.12)', borderColor: 'rgba(45,225,194,.5)' },
  tagMoney: { backgroundColor: 'rgba(124,92,252,.14)', borderColor: 'rgba(167,139,250,.55)' },
  tagUnlocked: { backgroundColor: 'rgba(124,92,252,.14)', borderColor: colors.primary },
  tagText: { fontSize: 12, fontWeight: '900' },
  tagTextFree: { color: colors.success },
  tagTextMoney: { color: colors.primaryLight },
  tagTextUnlocked: { color: colors.primaryLight },
  play: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  playIcon: { color: colors.textPrimary, fontSize: 13, fontWeight: '900', marginLeft: 2 },
});
