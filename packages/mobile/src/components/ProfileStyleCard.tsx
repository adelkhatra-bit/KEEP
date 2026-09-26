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
  badgeLabel?: string;
  badgeAccessibilityLabel?: string;
  onBadgePress?: () => void;
  actionLabel?: string;
  onActionPress?: () => void;
  actionAccessibilityLabel?: string;
  onPlayPress?: () => void;
  playAccessibilityLabel?: string;
  playing?: boolean;
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

const SALE_GRADIENTS: [string, string][] = [
  ['#FF2D78', '#7A00FF'],
  ['#FF8A00', '#FF2D78'],
  ['#00C6FF', '#7A00FF'],
  ['#FF4D6D', '#C9184A'],
];

function salePaletteFor(title: string): [string, string] {
  const seed = Array.from(title).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return SALE_GRADIENTS[seed % SALE_GRADIENTS.length];
}

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
  badgeLabel,
  badgeAccessibilityLabel,
  onBadgePress,
  actionLabel,
  onActionPress,
  actionAccessibilityLabel,
  onPlayPress,
  playAccessibilityLabel,
  playing = false,
  fullWidth = false,
  style,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const waveMotion = useRef(new Animated.Value(0)).current;
  const signalMotion = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const locked = mode === 'LOCKED';
  const unlocked = mode === 'UNLOCKED';
  const palette = paletteFor(title);
  const salePalette = salePaletteFor(title);
  const resolvedBadge = badgeLabel ?? (locked ? '🔒 EN VENTE' : unlocked ? '✓ DÉBLOQUÉ' : mode === 'VIBE' ? 'VIBE' : 'PUBLIC');

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
    waveMotion.setValue(0);
    signalMotion.setValue(0);
    const waveLoop = Animated.loop(Animated.sequence([
      Animated.timing(waveMotion, { toValue: 1, duration: 1500, useNativeDriver: true }),
      Animated.timing(waveMotion, { toValue: 0, duration: 1500, useNativeDriver: true }),
    ]));
    waveLoop.start();
    const signalLoop = Animated.loop(Animated.timing(signalMotion, { toValue: 1, duration: 2600, useNativeDriver: true }));
    signalLoop.start();
    return () => { loop.stop(); waveLoop.stop(); signalLoop.stop(); };
  }, [locked, pulse, reduceMotion, signalMotion, waveMotion]);

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
        <Pressable
          style={[s.badge, locked && s.badgeLocked, unlocked && s.badgeUnlocked, locked && !reduceMotion && { transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] }]}
          onPress={onBadgePress}
          disabled={!onBadgePress}
          accessibilityRole={onBadgePress ? 'button' : undefined}
          accessibilityLabel={badgeAccessibilityLabel ?? resolvedBadge}
        >
          <Text style={[s.badgeText, locked && s.badgeTextLocked, unlocked && s.badgeTextUnlocked]}>
            {resolvedBadge}
          </Text>
        </Pressable>
        <View style={s.topRight}>
          {actionLabel && onActionPress ? (
            <Pressable
              onPress={onActionPress}
              accessibilityRole="button"
              accessibilityLabel={actionAccessibilityLabel ?? actionLabel}
              style={[s.badge, s.sourceBadge]}
            >
              <Text style={[s.badgeText, s.sourceBadgeText]} numberOfLines={1}>{actionLabel}</Text>
            </Pressable>
          ) : null}
          {priceLabel ? <Text style={s.price}>{priceLabel}</Text> : null}
        </View>
      </View>
      <View style={s.bottom}>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        <Text style={s.subtitle} numberOfLines={2}>{subtitle}</Text>
        <View style={s.playSpacer} />
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
            colors={locked ? salePalette : unlocked ? [colors.keepPressed, colors.primaryDark] : palette}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.visual}
          >
            {locked ? (
              <>
                <Animated.View pointerEvents="none" style={[s.signalOrb, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.14, 0.42] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1.18] }) }] }]} />
                <Animated.View pointerEvents="none" style={[s.signalSweep, { transform: [{ translateX: signalMotion.interpolate({ inputRange: [0, 1], outputRange: [-210, 210] }) }, { rotate: '-12deg' }] }]} />
                <Animated.View pointerEvents="none" style={[s.wave, { transform: [{ translateX: waveMotion.interpolate({ inputRange: [0, 1], outputRange: [-18, 18] }) }] }]}>
                  {[20, 34, 54, 72, 46, 64, 30, 50, 24].map((height, index) => (
                    <Animated.View key={index} style={[s.waveBar, { height, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.32 + (index % 3) * .08, 0.9] }), transform: [{ scaleY: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7 + (index % 2) * .15, 1.08] }) }] }]} />
                  ))}
                </Animated.View>
                <View pointerEvents="none" style={s.signalLabel}><Text style={s.signalLabelText}>SIGNAL SECRET · EN ÉCOUTE</Text></View>
              </>
            ) : null}
            <LinearGradient colors={['rgba(4,3,10,.06)', 'rgba(4,3,10,.88)']} style={s.overlay}>
              {foreground}
            </LinearGradient>
          </LinearGradient>
        )}
      </Pressable>
      {onPlayPress ? (
        <Pressable
          onPress={onPlayPress}
          accessibilityRole="button"
          accessibilityLabel={playAccessibilityLabel ?? `Écouter ${title}`}
          style={[s.play, locked && s.playLocked, unlocked && s.playUnlocked, playing && s.playActive]}
        >
          <Text style={s.playText}>{playing ? 'Ⅱ' : '▶'}</Text>
        </Pressable>
      ) : (
        <View pointerEvents="none" style={[s.play, locked && s.playLocked, unlocked && s.playUnlocked]}>
          <Text style={s.playText}>▶</Text>
        </View>
      )}
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
  topRight: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, flexShrink: 1 },
  sourceBadge: { maxWidth: 104, borderColor: colors.keep },
  sourceBadgeText: { color: colors.keep },
  cardAction: {
    position: 'absolute',
    right: 10,
    top: 44,
    zIndex: 4,
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.keep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardActionText: { color: colors.keep, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
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
  playSpacer: { width: 34, height: 34 },
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
  playActive: { transform: [{ scale: 1.06 }], backgroundColor: colors.primary },
  playText: { color: colors.textPrimary, fontSize: 12, fontWeight: '900' },
  signalOrb: { position:'absolute', width:170, height:170, borderRadius:85, backgroundColor:'rgba(124,92,255,.34)', alignSelf:'center', top:-8 },
  signalSweep: { position:'absolute', width:90, height:240, top:-40, backgroundColor:'rgba(255,255,255,.08)' },
  signalLabel: { position:'absolute', left:12, bottom:10, paddingHorizontal:8, paddingVertical:4, borderRadius:10, backgroundColor:'rgba(4,3,10,.36)', borderWidth:1, borderColor:'rgba(255,255,255,.16)' },
  signalLabelText:{color:'rgba(255,255,255,.76)',fontSize:7,fontWeight:'900',letterSpacing:1.1},
  wave: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  waveBar: { width: 5, borderRadius: 3, backgroundColor: colors.primaryLight },
});
