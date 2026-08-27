import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ProfileCertificationTier } from '../services/publicProfileStateService';

type Props = {
  tier: ProfileCertificationTier;
  compact?: boolean;
};

const META: Record<ProfileCertificationTier, { label: string; border: string; background: string; text: string }> = {
  UNVERIFIED: { label: 'ESSAI', border: '#5B5265', background: '#1A1520', text: '#A79DAF' },
  FREE: { label: 'FREE', border: '#31C981', background: 'rgba(49,201,129,.12)', text: '#68F2B1' },
  PREMIUM: { label: 'PREMIUM', border: '#6F8CFF', background: 'rgba(111,140,255,.14)', text: '#AFC0FF' },
  CREATOR_PRO: { label: 'CREATOR PRO', border: '#A884FA', background: 'rgba(168,132,250,.14)', text: '#D9C7FF' },
  VENUE_PRO: { label: 'VENUE PRO', border: '#D6AA36', background: 'rgba(214,170,54,.15)', text: '#F7D979' },
};

export default function ProfileCertificationBadge({ tier, compact = false }: Props) {
  const meta = META[tier] ?? META.UNVERIFIED;
  return (
    <View style={[styles.badge, compact && styles.badgeCompact, { borderColor: meta.border, backgroundColor: meta.background }]} accessibilityLabel={`Certification KEEP ${meta.label}`}>
      <View style={[styles.dot, { backgroundColor: meta.border }]} />
      <Text style={[styles.text, compact && styles.textCompact, { color: meta.text }]}>{meta.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { minHeight: 25, paddingHorizontal: 9, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  badgeCompact: { minHeight: 21, paddingHorizontal: 7, borderRadius: 11, gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 9, fontWeight: '900', letterSpacing: .35 },
  textCompact: { fontSize: 8 },
});
