import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

const TOP_FLAMES = 20;
const SIDE_SPARKS = 7;
// micLevel est déjà amplifié par micCapture. Ces seuils gardent le cadre
// totalement immobile sur le bruit de fond tout en restant sensible à la musique.
const SOUND_GATE = 0.34;
const SOUND_RELEASE = 0.24;

function flameProfile(index: number) {
  const variants = [
    [0.22, 1.2],
    [0.42, 1.95],
    [0.32, 1.5],
    [0.56, 2.2],
    [0.36, 1.7],
  ];
  return variants[index % variants.length];
}

export default function ListenEnergyAura({
  active,
  recognizing: _recognizing,
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
  const rotation = useRef(new Animated.Value(0)).current;
  const rotation2 = useRef(new Animated.Value(0)).current;
  const energy = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;

  const targetEnergyRef = useRef(0);
  const smoothedEnergyRef = useRef(0);
  const angleRef = useRef(0);
  const angle2Ref = useRef(0);
  const phaseRef = useRef(0);
  const lastFrameRef = useRef<number | null>(null);
  const soundLatchedRef = useRef(false);
  const lastDetected = useRef(detectedCount);

  const raw = Math.max(0, Math.min(1, Number.isFinite(micLevel) ? micLevel : 0));

  if (!active) {
    targetEnergyRef.current = 0;
    soundLatchedRef.current = false;
  } else {
    const gate = soundLatchedRef.current ? SOUND_RELEASE : SOUND_GATE;
    if (raw <= gate) {
      targetEnergyRef.current = 0;
      soundLatchedRef.current = false;
    } else {
      soundLatchedRef.current = true;
      const normalized = (raw - gate) / Math.max(0.001, 1 - gate);
      targetEnergyRef.current = Math.min(1, Math.pow(normalized, 0.38) * 1.18);
    }
  }

  useEffect(() => {
    if (!active) {
      smoothedEnergyRef.current = 0;
      angleRef.current = 0;
      angle2Ref.current = 0;
      phaseRef.current = 0;
      lastFrameRef.current = null;
      rotation.setValue(0);
      rotation2.setValue(0);
      energy.setValue(0);
      pulse.setValue(0);
      return undefined;
    }

    let frame = 0;
    const draw = (ts: number) => {
      const previous = lastFrameRef.current ?? ts;
      const dt = Math.min(48, Math.max(0, ts - previous));
      lastFrameRef.current = ts;

      const target = targetEnergyRef.current;
      const current = smoothedEnergyRef.current;
      // Attaque rapide, relâchement court : le contour suit le micro sans inertie
      // visible quand le son s'arrête.
      const coefficient = target > current ? 0.62 : 0.5;
      const next = Math.abs(target - current) < 0.006 ? target : current + (target - current) * coefficient;
      smoothedEnergyRef.current = next;

      if (next <= 0.004) {
        energy.setValue(0);
        pulse.setValue(0);
      } else {
        // La vitesse du tourbillon dépend uniquement de l'énergie micro réelle.
        const degreesPerSecond = 70 + Math.pow(next, 1.35) * 980;
        angleRef.current = (angleRef.current + degreesPerSecond * (dt / 1000)) % 360;
        angle2Ref.current = (angle2Ref.current - degreesPerSecond * 0.72 * (dt / 1000) + 360) % 360;
        phaseRef.current = (phaseRef.current + (2.5 + next * 13) * (dt / 1000)) % (Math.PI * 2);

        rotation.setValue(angleRef.current / 360);
        rotation2.setValue(angle2Ref.current / 360);
        energy.setValue(next);
        pulse.setValue((0.5 + 0.5 * Math.sin(phaseRef.current)) * next);
      }

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      lastFrameRef.current = null;
    };
  }, [active, energy, pulse, rotation, rotation2]);

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
        Animated.timing(burst, { toValue: 0, duration: 720, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    }
    lastDetected.current = detectedCount;
  }, [active, burst, detectedCount]);

  const flames = useMemo(() => Array.from({ length: TOP_FLAMES }, (_, i) => i), []);
  const sparks = useMemo(() => Array.from({ length: SIDE_SPARKS }, (_, i) => i), []);

  const rotateA = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rotateB = rotation2.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const auraOpacity = energy.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0.42, 1] });
  const orbitScale = energy.interpolate({ inputRange: [0, 1], outputRange: [1.006, 1.07] });
  const waveScale1 = energy.interpolate({ inputRange: [0, 1], outputRange: [1, 1.085] });
  const waveScale2 = energy.interpolate({ inputRange: [0, 1], outputRange: [1, 1.13] });
  const waveOpacity = energy.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.2, 0.62] });
  const burstOpacity = burst.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 1, 0] });
  const burstScale = burst.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.19] });
  const flamePulse = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1.08] });

  return (
    // IMPORTANT : le conteneur et son contenu ne sont jamais transformés.
    // Durée / Détectés / Gardés restent donc parfaitement fixes ; seules les
    // couches décoratives autour du cadre réagissent au micro.
    <View style={s.shell}>
      <Animated.View pointerEvents="none" style={[s.wave, s.wavePurple, { opacity: waveOpacity, transform: [{ scale: waveScale1 }] }]} />
      <Animated.View pointerEvents="none" style={[s.wave, s.waveRed, { opacity: waveOpacity, transform: [{ scale: waveScale2 }] }]} />

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
          const [low, high] = flameProfile(index);
          const scaleY = energy.interpolate({ inputRange: [0, 1], outputRange: [low * 0.18, high * 1.25] });
          const translateY = energy.interpolate({ inputRange: [0, 1], outputRange: [0, -6 - (index % 5) * 1.7] });
          return <Animated.View key={`t-${index}`} style={[s.flame, index % 7 === 0 ? s.red : index % 5 === 0 ? s.hot : index % 2 === 0 ? s.purple : s.green, { opacity: auraOpacity, transform: [{ scaleY }, { scaleX: flamePulse }, { translateY }] }]} />;
        })}
      </View>

      <View pointerEvents="none" style={s.bottomRail}>
        {flames.map((index) => {
          const [low, high] = flameProfile(TOP_FLAMES - index);
          const scaleY = energy.interpolate({ inputRange: [0, 1], outputRange: [low * 0.18, high * 1.18] });
          const translateY = energy.interpolate({ inputRange: [0, 1], outputRange: [0, 6 + (index % 4) * 1.7] });
          return <Animated.View key={`b-${index}`} style={[s.flame, index % 6 === 0 ? s.red : index % 4 === 0 ? s.hot : index % 2 === 0 ? s.green : s.purple, { opacity: auraOpacity, transform: [{ scaleY }, { scaleX: flamePulse }, { translateY }] }]} />;
        })}
      </View>

      <View pointerEvents="none" style={s.leftRail}>
        {sparks.map((index) => <Animated.View key={`l-${index}`} style={[s.spark, index % 2 ? s.green : s.purple, { opacity: auraOpacity, transform: [{ scaleX: energy.interpolate({ inputRange: [0, 1], outputRange: [0.1, 2.25] }) }] }]} />)}
      </View>
      <View pointerEvents="none" style={s.rightRail}>
        {sparks.map((index) => <Animated.View key={`r-${index}`} style={[s.spark, index % 3 === 0 ? s.red : index % 2 ? s.hot : s.purple, { opacity: auraOpacity, transform: [{ scaleX: energy.interpolate({ inputRange: [0, 1], outputRange: [0.1, 2.35] }) }] }]} />)}
      </View>

      <Animated.View pointerEvents="none" style={[s.burst, { opacity: burstOpacity, transform: [{ scale: burstScale }] }]} />
      <View style={s.content}>{children}</View>
    </View>
  );
}

const s = StyleSheet.create({
  shell: { position: 'relative', marginTop: 15, marginBottom: 14, marginHorizontal: 6, borderRadius: 16, overflow: 'visible' },
  content: { position: 'relative', zIndex: 5 },
  wave: { ...StyleSheet.absoluteFillObject, zIndex: 0, borderRadius: 18, borderWidth: 2 },
  wavePurple: { borderColor: '#A77BFF', shadowColor: '#A77BFF', shadowOpacity: 1, shadowRadius: 14 },
  waveRed: { borderColor: '#FF3C69', shadowColor: '#FF3C69', shadowOpacity: 1, shadowRadius: 16 },
  orbit: { ...StyleSheet.absoluteFillObject, zIndex: 2, borderRadius: 20 },
  orbitOuter: { position: 'absolute', zIndex: 1, left: -12, right: -12, top: -12, bottom: -12, borderRadius: 24 },
  dash: { position: 'absolute', borderRadius: 8, shadowOpacity: 1, shadowRadius: 9 },
  topDash: { top: -4, left: '10%', width: '34%', height: 4 },
  rightDash: { right: -4, top: '14%', width: 4, height: '36%' },
  bottomDash: { bottom: -4, right: '10%', width: '38%', height: 4 },
  leftDash: { left: -4, bottom: '12%', width: 4, height: '34%' },
  outerDash: { position: 'absolute', borderRadius: 9, shadowOpacity: 1, shadowRadius: 11 },
  outerTop: { top: 0, right: '16%', width: '26%', height: 3 },
  outerRight: { right: 0, bottom: '16%', width: 3, height: '30%' },
  outerBottom: { bottom: 0, left: '16%', width: '26%', height: 3 },
  outerLeft: { left: 0, top: '16%', width: 3, height: '30%' },
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