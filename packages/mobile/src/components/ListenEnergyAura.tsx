import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

const TOP_FLAMES = 20;
const SIDE_SPARKS = 7;
const SOUND_GATE = 0.012;

function flameProfile(index: number) {
  const variants = [
    [0.28, 1.18, 0.46],
    [0.48, 1.82, 0.34],
    [0.38, 1.42, 0.78],
    [0.64, 2.05, 0.42],
    [0.42, 1.56, 0.24],
  ];
  return variants[index % variants.length];
}

function rotationDuration(level: number) {
  if (level >= 0.72) return 360;
  if (level >= 0.5) return 520;
  if (level >= 0.28) return 760;
  if (level >= 0.12) return 1080;
  return 1500;
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
  const pulse = useRef(new Animated.Value(0)).current;
  const energy = useRef(new Animated.Value(0)).current;
  const orbit = useRef(new Animated.Value(0)).current;
  const orbit2 = useRef(new Animated.Value(0)).current;
  const wave1 = useRef(new Animated.Value(0)).current;
  const wave2 = useRef(new Animated.Value(0)).current;
  const wave3 = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const lastDetected = useRef(detectedCount);

  const raw = Math.max(0, Math.min(1, Number.isFinite(micLevel) ? micLevel : 0));
  const soundActive = active && raw >= SOUND_GATE;
  const normalized = soundActive ? Math.min(1, Math.pow((raw - SOUND_GATE) / (1 - SOUND_GATE), 0.38) * 1.22) : 0;

  useEffect(() => {
    Animated.timing(energy, {
      toValue: normalized,
      duration: soundActive ? 45 : 80,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [energy, normalized, soundActive]);

  useEffect(() => {
    pulse.stopAnimation();
    if (!soundActive) {
      pulse.setValue(0);
      return undefined;
    }
    const d = normalized > 0.65 ? 72 : normalized > 0.3 ? 105 : 145;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: d, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.12, duration: d + 18, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.82, duration: Math.max(52, d - 20), easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: d + 38, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [normalized, pulse, soundActive]);

  useEffect(() => {
    orbit.stopAnimation();
    orbit2.stopAnimation();
    if (!soundActive) {
      orbit.setValue(0);
      orbit2.setValue(0);
      return undefined;
    }
    orbit.setValue(0);
    orbit2.setValue(0);
    const duration = rotationDuration(normalized);
    const a = Animated.loop(Animated.timing(orbit, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }));
    const b = Animated.loop(Animated.timing(orbit2, { toValue: 1, duration: Math.round(duration * 1.34), easing: Easing.linear, useNativeDriver: true }));
    a.start(); b.start();
    return () => { a.stop(); b.stop(); };
  }, [normalized, orbit, orbit2, soundActive]);

  useEffect(() => {
    wave1.stopAnimation(); wave2.stopAnimation(); wave3.stopAnimation();
    if (!soundActive) {
      wave1.setValue(0); wave2.setValue(0); wave3.setValue(0);
      return undefined;
    }
    const duration = normalized > 0.65 ? 520 : normalized > 0.3 ? 720 : 980;
    const makeWave = (v: Animated.Value, delay: number) => Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(v, { toValue: 1, duration, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 1, useNativeDriver: true }),
    ]));
    const a = makeWave(wave1, 0);
    const b = makeWave(wave2, Math.round(duration * 0.3));
    const c = makeWave(wave3, Math.round(duration * 0.6));
    a.start(); b.start(); c.start();
    return () => { a.stop(); b.stop(); c.stop(); };
  }, [normalized, soundActive, wave1, wave2, wave3]);

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
        Animated.timing(burst, { toValue: 1, duration: 70, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(burst, { toValue: 0, duration: 680, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    }
    lastDetected.current = detectedCount;
  }, [active, burst, detectedCount]);

  const flames = useMemo(() => Array.from({ length: TOP_FLAMES }, (_, i) => i), []);
  const sparks = useMemo(() => Array.from({ length: SIDE_SPARKS }, (_, i) => i), []);
  const flameEnergy = 0.34 + normalized * 1.28;

  const shellScale = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1 + normalized * 0.012, 1 + normalized * 0.035] });
  const orbitScale = energy.interpolate({ inputRange: [0, 1], outputRange: [1.005, 1.055] });
  const rotateA = orbit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rotateB = orbit2.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });
  const auraOpacity = energy.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.38, 0.96] });
  const burstOpacity = burst.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 1, 0] });
  const burstScale = burst.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.17] });

  const waveStyle = (v: Animated.Value, scale: number) => ({
    opacity: v.interpolate({ inputRange: [0, 0.12, 0.5, 1], outputRange: [0, 0.68, 0.26, 0] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.99, scale] }) }],
  });

  return (
    <Animated.View style={[s.shell, { transform: [{ scale: shellScale }] }]}>
      <Animated.View pointerEvents="none" style={[s.wave, s.wavePurple, waveStyle(wave1, 1.09)]} />
      <Animated.View pointerEvents="none" style={[s.wave, s.waveRed, waveStyle(wave2, 1.13)]} />
      <Animated.View pointerEvents="none" style={[s.wave, s.waveGreen, waveStyle(wave3, 1.17)]} />

      <Animated.View pointerEvents="none" style={[s.orbit, { opacity: auraOpacity, transform: [{ scale: orbitScale }, { rotate: rotateA }] }]}>
        <View style={[s.dash, s.topDash, s.purple]} />
        <View style={[s.dash, s.rightDash, s.red]} />
        <View style={[s.dash, s.bottomDash, s.green]} />
        <View style={[s.dash, s.leftDash, s.hot]} />
      </Animated.View>

      <Animated.View pointerEvents="none" style={[s.orbitOuter, { opacity: auraOpacity, transform: [{ rotate: rotateB }] }]}>
        <View style={[s.outerDash, s.outerTop, s.red]} />
        <View style={[s.outerDash, s.outerRight, s.purple]} />
        <View style={[s.outerDash, s.outerBottom, s.hot]} />
        <View style={[s.outerDash, s.outerLeft, s.green]} />
      </Animated.View>

      <View pointerEvents="none" style={s.topRail}>
        {flames.map((index) => {
          const [low, high, end] = flameProfile(index);
          const scaleY = pulse.interpolate({ inputRange: [0, 0.46, 1], outputRange: [low * flameEnergy, high * flameEnergy, end * flameEnergy] });
          const translateY = pulse.interpolate({ inputRange: [0, 1], outputRange: [2, -4 - (index % 5) * 1.5 - normalized * 7] });
          const opacity = energy.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.35, 1] });
          const color = index % 7 === 0 ? s.red : index % 5 === 0 ? s.hot : index % 2 === 0 ? s.purple : s.green;
          return <Animated.View key={`t-${index}`} style={[s.flame, color, { opacity, transform: [{ scaleY }, { translateY }] }]} />;
        })}
      </View>

      <View pointerEvents="none" style={s.bottomRail}>
        {flames.map((index) => {
          const [low, high, end] = flameProfile(TOP_FLAMES - index);
          const scaleY = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [end * flameEnergy, high * flameEnergy, low * flameEnergy] });
          const translateY = pulse.interpolate({ inputRange: [0, 1], outputRange: [-2, 4 + (index % 4) * 1.5 + normalized * 7] });
          const opacity = energy.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.3, 0.96] });
          const color = index % 6 === 0 ? s.red : index % 4 === 0 ? s.hot : index % 2 === 0 ? s.green : s.purple;
          return <Animated.View key={`b-${index}`} style={[s.flame, color, { opacity, transform: [{ scaleY }, { translateY }] }]} />;
        })}
      </View>

      <View pointerEvents="none" style={s.leftRail}>
        {sparks.map((index) => {
          const scaleX = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 1.6 + normalized * 0.8, 0.5] });
          const opacity = energy.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0, 0.3, 1] });
          return <Animated.View key={`l-${index}`} style={[s.spark, index % 2 ? s.green : s.purple, { opacity, transform: [{ scaleX }] }]} />;
        })}
      </View>

      <View pointerEvents="none" style={s.rightRail}>
        {sparks.map((index) => {
          const scaleX = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 1.7 + normalized * 0.9, 0.44] });
          const opacity = energy.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0, 0.3, 1] });
          return <Animated.View key={`r-${index}`} style={[s.spark, index % 3 === 0 ? s.red : index % 2 ? s.hot : s.purple, { opacity, transform: [{ scaleX }] }]} />;
        })}
      </View>

      <Animated.View pointerEvents="none" style={[s.burst, { opacity: burstOpacity, transform: [{ scale: burstScale }] }]} />
      <View style={s.content}>{children}</View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  shell: { position: 'relative', marginTop: 15, marginBottom: 14, marginHorizontal: 6, borderRadius: 16, overflow: 'visible' },
  content: { position: 'relative', zIndex: 5 },
  wave: { ...StyleSheet.absoluteFillObject, zIndex: 0, borderRadius: 18, borderWidth: 2 },
  wavePurple: { borderColor: '#A77BFF', shadowColor: '#A77BFF', shadowOpacity: 1, shadowRadius: 14 },
  waveRed: { borderColor: '#FF3C69', shadowColor: '#FF3C69', shadowOpacity: 1, shadowRadius: 16 },
  waveGreen: { borderColor: '#68F2B1', shadowColor: '#68F2B1', shadowOpacity: 1, shadowRadius: 14 },
  orbit: { ...StyleSheet.absoluteFillObject, zIndex: 2, borderRadius: 20 },
  orbitOuter: { position: 'absolute', zIndex: 1, left: -12, right: -12, top: -12, bottom: -12, borderRadius: 24 },
  dash: { position: 'absolute', borderRadius: 8, shadowOpacity: 1, shadowRadius: 8 },
  topDash: { top: -4, left: '12%', width: '32%', height: 4 },
  rightDash: { right: -4, top: '16%', width: 4, height: '34%' },
  bottomDash: { bottom: -4, right: '12%', width: '36%', height: 4 },
  leftDash: { left: -4, bottom: '14%', width: 4, height: '32%' },
  outerDash: { position: 'absolute', borderRadius: 9, shadowOpacity: 1, shadowRadius: 10 },
  outerTop: { top: 0, right: '18%', width: '24%', height: 3 },
  outerRight: { right: 0, bottom: '18%', width: 3, height: '28%' },
  outerBottom: { bottom: 0, left: '18%', width: '24%', height: 3 },
  outerLeft: { left: 0, top: '18%', width: 3, height: '28%' },
  topRail: { position: 'absolute', zIndex: 6, left: 6, right: 6, top: -15, height: 19, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  bottomRail: { position: 'absolute', zIndex: 6, left: 6, right: 6, bottom: -15, height: 19, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  leftRail: { position: 'absolute', zIndex: 6, left: -14, top: 5, bottom: 5, width: 15, justifyContent: 'space-around', alignItems: 'flex-end' },
  rightRail: { position: 'absolute', zIndex: 6, right: -14, top: 5, bottom: 5, width: 15, justifyContent: 'space-around', alignItems: 'flex-start' },
  flame: { width: 3.4, height: 13, borderRadius: 5, shadowOpacity: 1, shadowRadius: 6, elevation: 4 },
  spark: { width: 12, height: 3, borderRadius: 4, shadowOpacity: 1, shadowRadius: 6, elevation: 4 },
  purple: { backgroundColor: '#B79CFF', shadowColor: '#B79CFF' },
  red: { backgroundColor: '#FF3C69', shadowColor: '#FF3C69' },
  green: { backgroundColor: '#68F2B1', shadowColor: '#68F2B1' },
  hot: { backgroundColor: '#E5F266', shadowColor: '#E5F266' },
  burst: { ...StyleSheet.absoluteFillObject, zIndex: 8, borderRadius: 18, borderWidth: 3, borderColor: '#FFFFFF', shadowColor: '#E5F266', shadowOpacity: 1, shadowRadius: 20, elevation: 8 },
});