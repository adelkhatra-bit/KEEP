import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

const TOP_FLAMES = 22;
const SIDE_SPARKS = 8;

function flameProfile(index: number) {
  const variants = [
    [0.34, 1.08, 0.54],
    [0.58, 1.58, 0.38],
    [0.44, 1.28, 0.78],
    [0.72, 1.78, 0.48],
    [0.5, 1.42, 0.3],
  ];
  return variants[index % variants.length];
}

export default function ListenEnergyAura({
  active,
  recognizing,
  micLevel,
  detectedCount,
  children,
}: {
  active: boolean;
  recognizing: boolean;
  micLevel: number;
  detectedCount: number;
  children: React.ReactNode;
}) {
  const beat = useRef(new Animated.Value(0)).current;
  const chroma = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const lastDetected = useRef(detectedCount);

  useEffect(() => {
    beat.stopAnimation();
    if (!active) {
      beat.setValue(0);
      return undefined;
    }

    const fast = recognizing;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(beat, { toValue: 1, duration: fast ? 92 : 135, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(beat, { toValue: 0.08, duration: fast ? 105 : 155, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(beat, { toValue: 0.78, duration: fast ? 72 : 105, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(beat, { toValue: 0.16, duration: fast ? 90 : 130, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(beat, { toValue: 0.94, duration: fast ? 82 : 118, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(beat, { toValue: 0, duration: fast ? 145 : 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, beat, recognizing]);

  useEffect(() => {
    chroma.stopAnimation();
    if (!active) {
      chroma.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(chroma, { toValue: 1, duration: recognizing ? 260 : 420, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(chroma, { toValue: 0, duration: recognizing ? 230 : 390, easing: Easing.linear, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, chroma, recognizing]);

  useEffect(() => {
    sweep.stopAnimation();
    if (!active) {
      sweep.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: recognizing ? 430 : 760,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [active, recognizing, sweep]);

  useEffect(() => {
    if (!active) {
      lastDetected.current = detectedCount;
      burst.setValue(0);
      return;
    }
    if (detectedCount > lastDetected.current) {
      burst.stopAnimation();
      burst.setValue(0);
      Animated.sequence([
        Animated.timing(burst, { toValue: 1, duration: 72, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(burst, { toValue: 0, duration: 640, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    }
    lastDetected.current = detectedCount;
  }, [active, burst, detectedCount]);

  const inputEnergy = Math.max(0.1, Math.min(1, Number.isFinite(micLevel) ? micLevel : 0));
  const energyScale = 0.9 + Math.pow(inputEnergy, 0.36) * 0.64;
  const flameRows = useMemo(() => Array.from({ length: TOP_FLAMES }, (_, i) => i), []);
  const sideSparks = useMemo(() => Array.from({ length: SIDE_SPARKS }, (_, i) => i), []);

  const shellScale = beat.interpolate({ inputRange: [0, 0.12, 0.52, 1], outputRange: [0.972, 0.958, 1.018, 1.052 + inputEnergy * 0.014] });
  const shellOpacity = beat.interpolate({ inputRange: [0, 0.08, 0.45, 1], outputRange: [0.88, 0.72, 0.96, 1] });
  const purpleOpacity = chroma.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.68, 0.12, 0.9] });
  const redOpacity = chroma.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.08, 0.88, 0.16] });
  const greenOpacity = beat.interpolate({ inputRange: [0, 0.32, 0.72, 1], outputRange: [0.1, 0.58, 0.18, 0.72] });
  const flashOpacity = beat.interpolate({ inputRange: [0, 0.16, 0.44, 0.7, 1], outputRange: [0.04, 0.86, 0.18, 0.64, 0.98] });
  const burstOpacity = burst.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 1, 0] });
  const burstScale = burst.interpolate({ inputRange: [0, 1], outputRange: [0.93, 1.105] });
  const sweepX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-90, 440] });
  const sweepOpacity = chroma.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.25, 0.8, 0.34] });

  return (
    <Animated.View style={[s.shell, { opacity: shellOpacity, transform: [{ scale: shellScale }] }]}>
      <Animated.View pointerEvents="none" style={[s.purpleGlow, { opacity: purpleOpacity }]} />
      <Animated.View pointerEvents="none" style={[s.redGlow, { opacity: redOpacity }]} />
      <Animated.View pointerEvents="none" style={[s.greenGlow, { opacity: greenOpacity }]} />
      <Animated.View pointerEvents="none" style={[s.coreFlash, { opacity: flashOpacity }]} />
      <Animated.View pointerEvents="none" style={[s.sweep, { opacity: sweepOpacity, transform: [{ translateX: sweepX }, { skewX: '-20deg' }] }]} />

      <View pointerEvents="none" style={s.topRail}>
        {flameRows.map((index) => {
          const [low, high, end] = flameProfile(index);
          const scaleY = beat.interpolate({ inputRange: [0, 0.44, 1], outputRange: [low * energyScale, high * energyScale, end * energyScale] });
          const translateY = beat.interpolate({ inputRange: [0, 1], outputRange: [1.5, -4 - (index % 4) * 1.4] });
          const opacity = beat.interpolate({ inputRange: [0, 0.35, 0.62, 1], outputRange: [0.26, 1, 0.38, 0.94] });
          const colorStyle = index % 7 === 0 ? s.flameRed : index % 5 === 0 ? s.flameHot : index % 2 === 0 ? s.flamePurple : s.flameGreen;
          return <Animated.View key={`tf-${index}`} style={[s.flame, colorStyle, { opacity, transform: [{ scaleY }, { translateY }] }]} />;
        })}
      </View>

      <View pointerEvents="none" style={s.bottomRail}>
        {flameRows.map((index) => {
          const mirrored = TOP_FLAMES - 1 - index;
          const [low, high, end] = flameProfile(mirrored + 1);
          const scaleY = beat.interpolate({ inputRange: [0, 0.5, 1], outputRange: [end * energyScale, high * 0.94 * energyScale, low * energyScale] });
          const translateY = beat.interpolate({ inputRange: [0, 1], outputRange: [-1, 3 + (index % 3) * 1.4] });
          const opacity = beat.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.22, 0.96, 0.36] });
          const colorStyle = index % 6 === 0 ? s.flameRed : index % 4 === 0 ? s.flameHot : index % 2 === 0 ? s.flameGreen : s.flamePurple;
          return <Animated.View key={`bf-${index}`} style={[s.flame, colorStyle, { opacity, transform: [{ scaleY }, { translateY }] }]} />;
        })}
      </View>

      <View pointerEvents="none" style={s.leftRail}>
        {sideSparks.map((index) => {
          const scaleX = beat.interpolate({ inputRange: [0, 0.48, 1], outputRange: [0.38, 1.7 - index * 0.05, 0.62] });
          const translateX = beat.interpolate({ inputRange: [0, 1], outputRange: [2, -5 - (index % 3) * 1.6] });
          const opacity = beat.interpolate({ inputRange: [0, 0.38, 1], outputRange: [0.16, 0.96, 0.34] });
          return <Animated.View key={`ls-${index}`} style={[s.spark, index % 4 === 0 ? s.flameRed : index % 2 ? s.flameGreen : s.flamePurple, { opacity, transform: [{ scaleX }, { translateX }] }]} />;
        })}
      </View>

      <View pointerEvents="none" style={s.rightRail}>
        {sideSparks.map((index) => {
          const scaleX = beat.interpolate({ inputRange: [0, 0.58, 1], outputRange: [0.52, 1.78 - index * 0.045, 0.35] });
          const translateX = beat.interpolate({ inputRange: [0, 1], outputRange: [-2, 5 + (index % 3) * 1.6] });
          const opacity = beat.interpolate({ inputRange: [0, 0.52, 1], outputRange: [0.2, 1, 0.26] });
          return <Animated.View key={`rs-${index}`} style={[s.spark, index % 3 === 0 ? s.flameHot : index % 2 ? s.flameRed : s.flamePurple, { opacity, transform: [{ scaleX }, { translateX }] }]} />;
        })}
      </View>

      <Animated.View pointerEvents="none" style={[s.burst, { opacity: burstOpacity, transform: [{ scale: burstScale }] }]} />
      <View style={s.content}>{children}</View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  shell: { position: 'relative', marginTop: 13, marginBottom: 12, marginHorizontal: 4, borderRadius: 16, overflow: 'visible' },
  content: { position: 'relative', zIndex: 5 },
  purpleGlow: { ...StyleSheet.absoluteFillObject, zIndex: 0, borderRadius: 17, borderWidth: 2, borderColor: '#A77BFF', backgroundColor: 'rgba(139,92,246,0.10)', shadowColor: '#A77BFF', shadowOpacity: 1, shadowRadius: 11, elevation: 4 },
  redGlow: { ...StyleSheet.absoluteFillObject, zIndex: 1, borderRadius: 17, borderWidth: 2, borderColor: '#FF3C69', backgroundColor: 'rgba(255,60,105,0.08)', shadowColor: '#FF3C69', shadowOpacity: 1, shadowRadius: 13, elevation: 4 },
  greenGlow: { ...StyleSheet.absoluteFillObject, zIndex: 2, borderRadius: 17, borderWidth: 1.5, borderColor: '#68F2B1', shadowColor: '#68F2B1', shadowOpacity: 0.95, shadowRadius: 9, elevation: 4 },
  coreFlash: { ...StyleSheet.absoluteFillObject, zIndex: 1, borderRadius: 17, backgroundColor: 'rgba(229,242,102,0.09)' },
  sweep: { position: 'absolute', zIndex: 4, top: -13, bottom: -13, left: 0, width: 42, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.16)' },
  topRail: { position: 'absolute', zIndex: 6, left: 8, right: 8, top: -14, height: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  bottomRail: { position: 'absolute', zIndex: 6, left: 8, right: 8, bottom: -14, height: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  leftRail: { position: 'absolute', zIndex: 6, left: -13, top: 5, bottom: 5, width: 14, justifyContent: 'space-around', alignItems: 'flex-end' },
  rightRail: { position: 'absolute', zIndex: 6, right: -13, top: 5, bottom: 5, width: 14, justifyContent: 'space-around', alignItems: 'flex-start' },
  flame: { width: 3.4, height: 13, borderRadius: 5, shadowOpacity: 1, shadowRadius: 6, elevation: 5 },
  spark: { width: 12, height: 3, borderRadius: 4, shadowOpacity: 1, shadowRadius: 6, elevation: 5 },
  flameGreen: { backgroundColor: '#68F2B1', shadowColor: '#68F2B1' },
  flamePurple: { backgroundColor: '#B79CFF', shadowColor: '#B79CFF' },
  flameHot: { backgroundColor: '#E5F266', shadowColor: '#E5F266' },
  flameRed: { backgroundColor: '#FF3C69', shadowColor: '#FF3C69' },
  burst: { ...StyleSheet.absoluteFillObject, zIndex: 7, borderRadius: 18, borderWidth: 3, borderColor: '#FFFFFF', shadowColor: '#E5F266', shadowOpacity: 1, shadowRadius: 18, elevation: 8 },
});