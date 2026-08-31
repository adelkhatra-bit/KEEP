import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { colors } from '../theme/colors';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const SIZE = 176;
const CENTER = SIZE / 2;
const BAR_COUNT = 5;

/**
 * Animation centrale de "session en cours" — remplace l'ancienne grosse
 * pochette statique. Ondes concentriques + petit spectre au centre,
 * pour montrer que Loki analyse réellement l'environnement plutôt que de
 * jouer un morceau (cf. corrections concept du 21/08/2026).
 */
export default function SessionPulse({ active = true }: { active?: boolean }) {
  const ring1 = useSharedValue(0);
  const ring2 = useSharedValue(0);
  const ring3 = useSharedValue(0);
  const bars = Array.from({ length: BAR_COUNT }, () => useSharedValue(0.3));

  useEffect(() => {
    if (!active) return;
    ring1.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.out(Easing.ease) }), -1, false);
    ring2.value = withDelay(700, withRepeat(withTiming(1, { duration: 2200, easing: Easing.out(Easing.ease) }), -1, false));
    ring3.value = withDelay(1400, withRepeat(withTiming(1, { duration: 2200, easing: Easing.out(Easing.ease) }), -1, false));

    bars.forEach((bar, i) => {
      bar.value = withDelay(
        i * 90,
        withRepeat(
          withSequence(
            withTiming(0.9, { duration: 340 + i * 40, easing: Easing.inOut(Easing.ease) }),
            withTiming(0.25, { duration: 340 + i * 40, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        )
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const ring1Props = useAnimatedProps(() => ({
    r: 30 + ring1.value * (CENTER - 8),
    opacity: 1 - ring1.value,
  }));
  const ring2Props = useAnimatedProps(() => ({
    r: 30 + ring2.value * (CENTER - 8),
    opacity: 1 - ring2.value,
  }));
  const ring3Props = useAnimatedProps(() => ({
    r: 30 + ring3.value * (CENTER - 8),
    opacity: 1 - ring3.value,
  }));

  return (
    <View style={styles.container}>
      <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
        <Circle cx={CENTER} cy={CENTER} r={30} fill={colors.backgroundCard} stroke={colors.primary} strokeWidth={1.5} opacity={0.6} />
        <AnimatedCircle cx={CENTER} cy={CENTER} fill="none" stroke={colors.primaryLight} strokeWidth={2} animatedProps={ring3Props} />
        <AnimatedCircle cx={CENTER} cy={CENTER} fill="none" stroke={colors.primaryLight} strokeWidth={2} animatedProps={ring2Props} />
        <AnimatedCircle cx={CENTER} cy={CENTER} fill="none" stroke={colors.primary} strokeWidth={2} animatedProps={ring1Props} />
      </Svg>
      <View style={styles.bars}>
        {bars.map((bar, i) => (
          <Bar key={i} progress={bar} />
        ))}
      </View>
    </View>
  );
}

function Bar({ progress }: { progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    height: 8 + progress.value * 22,
    opacity: 0.55 + progress.value * 0.45,
  }));
  return <Animated.View style={[styles.bar, style]} />;
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
