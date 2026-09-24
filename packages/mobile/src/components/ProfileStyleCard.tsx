import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  ImageBackground,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';

type Mode = 'PUBLIC' | 'LOCKED' | 'UNLOCKED' | 'VIBE';

type Props = {
  title: string;
  subtitle: string;
  mode: Mode;
  onPress: () => void;
  accessibilityLabel: string;
  artworkUrl?: string | null;
  priceLabel?: string;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

const PUBLIC_GRADIENTS: [string, string][] = [
  ['#7028E4', '#E5B2CA'],
  ['#0061FF', '#60EFFF'],
  ['#FF3CAC', '#784BA0'],
  ['#F97794', '#623AA2'],
  ['#43CBFF', '#9708CC'],
  ['#FAD961', '#F76B1C'],
];

function paletteFor(title: string): [string, string] {
  const seed = Array.from(title).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return PUBLIC_GRADIENTS[seed % PUBLIC_GRADIENTS.length];
}

/**
 * Carte premium commune aux styles publics et collections verrouillées.
 * Le mode LOCKED ne reçoit jamais de vraie pochette : visuel abstrait seulement.
 */
export default function ProfileStyleCard({
  title,
  subtitle,
  mode,
  onPress,
  accessibilityLabel,
  artworkUrl,
  priceLabel,
  fullWidth = false,
  style,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const locked = mode === 'LOCKED';
  const unlocked = mode === 'UNLOCKED';
  const palette = paletteFor(title);

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((value) => { if (live) setReduceMotion(Boolean(value)); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    pulse.stopAnimation();
    if (reduceMotion || !locked) {
      pulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1250, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1250, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [locked, pulse, reduceMotion]);

  const pressTo = (value: number) => {
    if (reduceMotion) {
      scale.setValue(value);
      return;
    }
    Animated.spring(scale, {
      toValue: value,
      damping: 16,
      stiffness: 260,
      mass: 0.45,
      useNativeDriver: true,
    }).start();
  };

  const foreground = (
    <>
      <View style={s.topRow}>
        <View style={[s.badge, locked && s.badgeLocked, unlocked && s.badgeUnlocked]}>
          <Text style={[s.badgeText, locked && s.badgeTextLocked, unlocked && s.badgeTextUnlocked]}>
            {locked ? '🔒 EN VENTE' : unlocked ? '✓ DÉBLOQUÉ' : mode === 'VIBE' ? 'VIBE' : 'PUBLIC'}
          </Text>
        </View>
        {priceLabel ? <Text style={s.price}>{priceLabel}</Text> : null}
      </View>
      <View style={s.bottom}>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        <Text style={s.subtitle} numberOfLines={2}>{subtitle}</Text>
        <View style={[s.play, locked && s.playLocked, unlocked && s.playUnlocked]}>
          <Text style={s.playText}>{locked ? '◉' : '▶'}</Text>
        </View>
      </View>
    </>
  );

  return (
    <Animated.View
      style={[
        s.wrap,
        fullWidth ? s.fullWidth : s.halfWidth,
        style,
        { transform: [{ scale }] },
      ]}
    >
      {locked ? (
        <Animated.View
          pointerEvents="none"
          style={[
            s.lockGlow,
            {
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.5] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1.035] }) }],
            },
          ]}
        />
      ) : null}
      <Pressable
        onPress={onPress}
        onPressIn={() => pressTo(0.97)}
        onPressOut={() => pressTo(1)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={s.pressable}
      >
        {!locked && artworkUrl ? (
          <ImageBackground source={{ uri: artworkUrl }} style={s.visual} imageStyle={s.image}>
            <LinearGradient colors={['rgba(4,3,10,.08)', 'rgba(4,3,10,.90)']} style={s.overlay}>
              {foreground}
            </LinearGradient>
          </ImageBackground>
        ) : (
          <LinearGradient
            colors={locked ? [colors.primaryDark, colors.backgroundCard] : unlocked ? [colors.keepDark, colors.primaryDark] : palette}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.visual}
          >
            {locked ? (
              <View pointerEvents="none" style={s.wave}>
                {[20, 34, 54, 72, 46, 64, 30, 50, 24].map((height, index) => (
                  <View key={index} style={[s.waveBar, { height }]} />
                ))}
              </View>
            ) : null}
            <LinearGradient colors={['rgba(4,3,10,.06)', 'rgba(4,3,10,.88)']} style={s.overlay}>
              {foreground}
            </LinearGradient>
          </LinearGradient>
        )}
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { minHeight: 154, marginBottom: 10, borderRadius: 20, position: 'relative' },
  halfWidth: { width: '48.5%' },
  fullWidth: { width: '100%' },
  lockGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.primaryLight,
  },
  pressable: { flex: 1, borderRadius: 20, overflow: 'hidden' },
  visual: {
    flex: 1,
    minHeight: 154,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  image: { borderRadius: 20 },
  overlay: { flex: 1, padding: 12, justifyContent: 'space-between' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  badge: {
    minHeight: 24,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(4,3,10,.62)',
    borderWidth: 1,
    borderColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLocked: { borderColor: colors.primaryLight },
  badgeUnlocked: { borderColor: colors.keep },
  badgeText: { color: colors.success, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  badgeTextLocked: { color: colors.primaryLight },
  badgeTextUnlocked: { color: colors.keep },
  price: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(4,3,10,.72)',
  },
  bottom: { minHeight: 64, justifyContent: 'flex-end', paddingRight: 38 },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '900', letterSpacing: 0.2 },
  subtitle: { color: colors.textPrimary, opacity: 0.88, fontSize: 10, lineHeight: 14, marginTop: 3 },
  play: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(4,3,10,.72)',
    borderWidth: 1,
    borderColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playLocked: { borderColor: colors.primaryLight },
  playUnlocked: { borderColor: colors.keep },
  playText: { color: colors.textPrimary, fontSize: 12, fontWeight: '900' },
  wave: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    opacity: 0.38,
  },
  waveBar: { width: 5, borderRadius: 3, backgroundColor: colors.primaryLight },
});
