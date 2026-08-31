import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ProfileCertificationTier } from '../services/publicProfileStateService';

type Props = {
  tier: ProfileCertificationTier;
  compact?: boolean;
  showLabel?: boolean;
};

type TierMeta = {
  label: string;
  colors: readonly [string, string, ...string[]];
  ring: string;
  check: string;
};

export const CERTIFICATION_META: Record<ProfileCertificationTier, TierMeta> = {
  UNVERIFIED: { label: 'ESSAI', colors: ['#3D3745', '#211C27'], ring: '#62596D', check: '#B9AFBF' },
  FREE: { label: 'FREE', colors: ['#78F5BA', '#22B975'], ring: '#98FFD0', check: '#062418' },
  PREMIUM: { label: 'PREMIUM', colors: ['#8EAAFF', '#5575F2'], ring: '#C3D0FF', check: '#FFFFFF' },
  CREATOR_PRO: { label: 'CREATOR PRO', colors: ['#D2B9FF', '#8B5CF6'], ring: '#E7D9FF', check: '#FFFFFF' },
  // Reflet volontairement asymétrique : la formule 29,99 € doit se lire comme
  // le niveau « or » de Loki, pas comme une simple pastille jaune.
  VENUE_PRO: { label: 'VENUE PRO', colors: ['#FFF4B8', '#C99722', '#FFF0A1', '#8D6310'], ring: '#FFF2A8', check: '#352300' },
};

export default function ProfileCertificationBadge({ tier, compact = false, showLabel = false }: Props) {
  const meta = CERTIFICATION_META[tier] ?? CERTIFICATION_META.UNVERIFIED;
  const size = compact ? 20 : 26;
  return (
    <View style={styles.wrap} accessibilityLabel={`Certification Loki ${meta.label}`}>
      <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2, borderColor: meta.ring }]}>
        <LinearGradient colors={meta.colors as [string, string, ...string[]]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={[styles.medallion, { borderRadius: size / 2 }]}>
          <Text style={[styles.check, compact && styles.checkCompact, { color: meta.check }]}>✓</Text>
          {tier === 'VENUE_PRO' ? <View pointerEvents="none" style={styles.goldGlint} /> : null}
        </LinearGradient>
      </View>
      {showLabel ? <Text style={[styles.label, compact && styles.labelCompact, { color: meta.ring }]}>{meta.label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ring: { borderWidth: 1.5, padding: 1.5, alignItems: 'center', justifyContent: 'center' },
  medallion: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  check: { fontSize: 13, lineHeight: 15, fontWeight: '900' },
  checkCompact: { fontSize: 10, lineHeight: 12 },
  goldGlint: { position: 'absolute', left: 3, top: 2, width: '46%', height: 3, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.72)', transform: [{ rotate: '-22deg' }] },
  label: { fontSize: 9, fontWeight: '900', letterSpacing: .35 },
  labelCompact: { fontSize: 8 },
});
