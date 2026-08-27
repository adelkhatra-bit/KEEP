import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

const TOP_FLAMES = 18;
const SIDE_SPARKS = 7;

function flameProfile(index: number) {
  const variants = [
    [0.42, 1.0, 0.58],
    [0.68, 1.34, 0.46],
    [0.5, 1.18, 0.82],
    [0.76, 1.48, 0.54],
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
        Animated.timing(beat, { toValue: 1, duration: fast ? 145 : 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(beat, { toValue: 0.22, duration: fast ? 150 : 240, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(beat, { toValue: 0.84, duration: fast ? 115 : 175, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(beat, { toValue: 0, duration: fast ? 185 : 310, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, beat, recognizing]);

  useEffect(() => {
    sweep.stopAnimation();
    if (!active) {
      sweep.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: recognizing ? 620 : 1050,
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
        Animated.timing(burst, { toValue: 1, duration: 105, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(burst, { toValue: 0, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    }
    lastDetected.current = detectedCount;
  }, [active, burst, detectedCount]);

  const inputEnergy = Math.max(0.12, Math.min(1, Number.isFinite(micLevel) ? micLevel : 0));
  const energyScale = 0.82 + Math.pow(inputEnergy, 0.42) * 0.42;
  const flameRows = useMemo(() => Array.from({ length: TOP_FLAMES }, (_, i) => i), []);
  const sideSparks = useMemo(() => Array.from({ length: SIDE_SPARKS }, (_, i) => i), []);

  const shellScale = beat.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.004, 1.011 + inputEnergy * 0.01] });
  const flashOpacity = beat.interpolate({ inputRange: [0, 0.22, 0.54, 1], outputRange: [0.08, 0.56, 0.18, 0.72] });
  const burstOpacity = burst.interpolate({ inputRange: [0, 0.16, 1], outputRange: [0, 1, 0] });
  const burstScale = burst.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1.055] });
  const sweepX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-70, 420] });

  return (
    <Animated.View style={[s.shell, { transform: [{ scale: shellScale }] }]}>
      <Animated.View pointerEvents="none" style={[s.coreFlash, { opacity: flashOpacity }]} />
      <Animated.View pointerEvents="none" style={[s.sweep, { transform: [{ translateX: sweepX }] }]} />

      <View pointerEvents="none" style={s.topRail}>
        {flameRows.map((index) => {
          const [low, high, end] = flameProfile(index);
          const scaleY = beat.interpolate({
            inputRange: [0, 0.48, 1],
            outputRange: [low * energyScale, high * energyScale, end * energyScale],
          });
          const opacity = beat.interpolate({
            inputRange: [0, 0.45, 1],
            outputRange: [0.34 + (index % 3) * 0.08, 0.96, 0.48 + (index % 2) * 0.16],
          });
          return <Animated.View key={`tf-${index}`} style={[s.flame, index % 5 === 0 ? s.flameHot : index % 2 === 0 ? s.flamePurple : s.flameGreen, { opacity, transform: [{ scaleY }] }]} />;
        })}
      </View>

      <View pointerEvents="none" style={s.bottomRail}>
        {flameRows.map((index) => {
          const mirrored = TOP_FLAMES - 1 - index;
          const [low, high, end] = flameProfile(mirrored + 1);
          const scaleY = beat.interpolate({
            inputRange: [0, 0.52, 1],
            outputRange: [end * energyScale, high * 0.82 * energyScale, low * energyScale],
          });
          const opacity = beat.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0.28, 0.86, 0.4] });
          return <Animated.View key={`bf-${index}`} style={[s.flame, index % 4 === 0 ? s.flameHot : index % 2 === 0 ? s.flameGreen : s.flamePurple, { opacity, transform: [{ scaleY }] }]} />;
        })}
      </View>

      <View pointerEvents="none" style={s.leftRail}>
        {sideSparks.map((index) => {
          const scaleX = beat.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.45, 1.35 - index * 0.035, 0.68] });
          const opacity = beat.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.2, 0.88, 0.35] });
          return <Animated.View key={`ls-${index}`} style={[s.spark, index % 2 ? s.flameGreen : s.flamePurple, { opacity, transform: [{ scaleX }] }]} />;
        })}
      </View>

      <View pointerEvents="none" style={s.rightRail}>
        {sideSparks.map((index) => {
          const scaleX = beat.interpolate({ inputRange: [0, 0.56, 1], outputRange: [0.6, 1.44 - index * 0.04, 0.42] });
          const opacity = beat.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.24, 0.94, 0.3] });
          return <Animated.View key={`rs-${index}`} style={[s.spark, index % 3 === 0 ? s.flameHot : index % 2 ? s.flamePurple : s.flameGreen, { opacity, transform: [{ scaleX }] }]} />;
        })}
      </View>

      <Animated.View pointerEvents="none" style={[s.burst, { opacity: burstOpacity, transform: [{ scale: burstScale }] }]} />
      <View style={s.content}>{children}</View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  shell: { position: 'relative', marginTop: 9, marginBottom: 8, marginHorizontal: 3, borderRadius: 15, overflow: 'visible' },
  content: { position: 'relative', zIndex: 2 },
  coreFlash: { ...StyleSheet.absoluteFillObject, zIndex: 0, borderRadius: 15, backgroundColor: 'rgba(104,242,177,0.18)' },
  sweep: { position: 'absolute', zIndex: 1, top: -9, bottom: -9, left: 0, width: 34, borderRadius: 20, backgroundColor: 'rgba(229,242,102,0.16)', transform: [{ skewX: '-18deg' }] },
  topRail: { position: 'absolute', zIndex: 3, left: 12, right: 12, top: -10, height: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  bottomRail: { position: 'absolute', zIndex: 3, left: 12, right: 12, bottom: -10, height: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  leftRail: { position: 'absolute', zIndex: 3, left: -9, top: 7, bottom: 7, width: 11, justifyContent: 'space-around', alignItems: 'flex-end' },
  rightRail: { position: 'absolute', zIndex: 3, right: -9, top: 7, bottom: 7, width: 11, justifyContent: 'space-around', alignItems: 'flex-start' },
  flame: { width: 3, height: 10, borderRadius: 4, shadowOpacity: 0.95, shadowRadius: 5, elevation: 3 },
  spark: { width: 9, height: 2.6, borderRadius: 3, shadowOpacity: 0.9, shadowRadius: 4, elevation: 3 },
  flameGreen: { backgroundColor: '#68F2B1', shadowColor: '#68F2B1' },
  flamePurple: { backgroundColor: '#B79CFF', shadowColor: '#B79CFF' },
  flameHot: { backgroundColor: '#E5F266', shadowColor: '#E5F266' },
  burst: { ...StyleSheet.absoluteFillObject, zIndex: 4, borderRadius: 15, borderWidth: 2, borderColor: '#E5F266', shadowColor: '#E5F266', shadowOpacity: 1, shadowRadius: 12, elevation: 5 },
});
