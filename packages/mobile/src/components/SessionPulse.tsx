import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../theme/colors';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const SIZE = 176;
const CENTER = SIZE / 2;
const BAR_COUNT = 5;
const RING_DURATION = 2200;
const RING_DELAY = 700;
/** Légère variation par barre pour un rendu "égaliseur" plutôt que 5 barres identiques. */
const BAR_WEIGHTS = [0.7, 0.9, 1, 0.85, 0.6];

/**
 * Animation centrale de "session en cours".
 *
 * `level` (0-1, optionnel) = niveau micro réel EN DIRECT (voir
 * services/micCapture.ts + store/useSessionStore.ts `micLevel`). Quand
 * fourni, les barres réagissent VRAIMENT au son détecté -- immobiles en
 * silence, actives dès qu'un son arrive -- au lieu d'une boucle décorative
 * indépendante (cf. demande explicite du 22/08/2026 : "si y'a pas de son ça
 * bouge pas, dès qu'elle détecte un son ça bouge, il faut que ce soit
 * connecté"). Sans `level` (Mode Démo, ou metering non fourni par le
 * navigateur), repli sur la boucle ambiante d'origine -- jamais une fausse
 * activité présentée comme réelle.
 *
 * Reconstruite avec l'API `Animated` du cœur React Native (pas
 * react-native-reanimated, qui ne s'animait pas du tout sur Web faute du
 * plugin Babel dédié -- confirmé et corrigé le 22/08/2026).
 */
export default function SessionPulse({ active = true, level }: { active?: boolean; level?: number }) {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;
  const bars = useRef(Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.3))).current;
  const isLive = typeof level === 'number';

  useEffect(() => {
    if (!active) return undefined;

    const ringLoop = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, { toValue: 1, duration: RING_DURATION, easing: Easing.out(Easing.ease), useNativeDriver: false }),
          Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: false }),
        ])
      );
    const animations = [ringLoop(ring1, 0), ringLoop(ring2, RING_DELAY), ringLoop(ring3, RING_DELAY * 2)];
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [active, ring1, ring2, ring3]);

  // Boucle décorative des barres -- uniquement quand aucun niveau micro réel
  // n'est fourni (Mode Démo / metering indisponible).
  useEffect(() => {
    if (!active || isLive) return undefined;
    const barLoop = (value: Animated.Value, index: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 90),
          Animated.timing(value, { toValue: 0.9, duration: 340 + index * 40, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
          Animated.timing(value, { toValue: 0.25, duration: 340 + index * 40, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        ])
      );
    const animations = bars.map((b, i) => barLoop(b, i));
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [active, isLive, bars]);

  // Barres pilotées par le niveau micro réel -- réagit immédiatement (150ms)
  // à chaque mise à jour de `level`, immobile si `level` reste à 0 (silence).
  useEffect(() => {
    if (!isLive) return;
    const target = Math.max(0, Math.min(1, level as number));
    const animations = bars.map((b, i) =>
      Animated.timing(b, { toValue: 0.15 + target * BAR_WEIGHTS[i] * 0.85, duration: 150, easing: Easing.out(Easing.ease), useNativeDriver: false })
    );
    Animated.parallel(animations).start();
  }, [level, isLive, bars]);

  const ringRadius = (v: Animated.Value) => v.interpolate({ inputRange: [0, 1], outputRange: [30, CENTER - 8] });
  const ringOpacity = (v: Animated.Value) => v.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <View style={styles.container}>
      <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
        <Circle cx={CENTER} cy={CENTER} r={30} fill={colors.backgroundCard} stroke={colors.primary} strokeWidth={1.5} opacity={0.6} />
        <AnimatedCircle cx={CENTER} cy={CENTER} r={ringRadius(ring3)} fill="none" stroke={colors.primaryLight} strokeWidth={2} opacity={ringOpacity(ring3)} />
        <AnimatedCircle cx={CENTER} cy={CENTER} r={ringRadius(ring2)} fill="none" stroke={colors.primaryLight} strokeWidth={2} opacity={ringOpacity(ring2)} />
        <AnimatedCircle cx={CENTER} cy={CENTER} r={ringRadius(ring1)} fill="none" stroke={colors.primary} strokeWidth={2} opacity={ringOpacity(ring1)} />
      </Svg>
      <View style={styles.bars}>
        {bars.map((bar, i) => (
          <Bar key={i} progress={bar} />
        ))}
      </View>
    </View>
  );
}

function Bar({ progress }: { progress: Animated.Value }) {
  const height = progress.interpolate({ inputRange: [0, 1], outputRange: [8, 30] });
  const opacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  return <Animated.View style={[styles.bar, { height, opacity }]} />;
}

const styles = StyleSheet.create({
  container: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 30,
  },
  bar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: colors.keep,
  },
});
