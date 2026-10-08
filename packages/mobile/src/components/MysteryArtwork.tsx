import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Pochette « mystère » pour les musiques masquées / en vente (Adel, 05/10/2026 : « une animation 4D »).
 * Anneaux qui pulsent, orbe dégradé qui tourne et bascule en perspective, reflet qui balaie la carte.
 * Pur décor : aucune interaction (pointerEvents none), même rendu iPhone et ordinateur.
 */
export default function MysteryArtwork({ caption = 'Titre masqué', scale = 1 }: { caption?: string; scale?: number }) {
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const tilt = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const native = Platform.OS !== 'web';
    const loops = [
      Animated.loop(Animated.timing(spin, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: native })),
      Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
        Animated.timing(pulse, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
      ])),
      Animated.loop(Animated.sequence([
        Animated.timing(tilt, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(tilt, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ])),
      Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 3800, easing: Easing.inOut(Easing.quad), useNativeDriver: native })),
    ];
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [spin, pulse, tilt, sweep]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1.16] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0.15] });
  const rotateY = tilt.interpolate({ inputRange: [0, 1], outputRange: ['-24deg', '24deg'] });
  const rotateX = tilt.interpolate({ inputRange: [0, 1], outputRange: ['14deg', '-14deg'] });
  const sweepX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-260, 260] });

  return (
    <View style={[s.wrap, scale !== 1 && { transform: [{ scale }] }]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[s.ring, s.ringBig, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
      <Animated.View style={[s.ring, s.ringSmall, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
      <Animated.View style={[s.stage, { transform: [{ perspective: 600 }, { rotateX }, { rotateY }] }]}>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <LinearGradient colors={['#FF3D9A', '#7C5CFC', '#2DE1C2', '#FFB020']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.orb} />
        </Animated.View>
        <View style={s.orbCore}><Text style={s.question}>?</Text></View>
      </Animated.View>
      <Animated.View style={[s.shine, { transform: [{ translateX: sweepX }, { rotate: '18deg' }] }]} />
      {caption ? <Text style={s.caption}>{caption}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ring: { position: 'absolute', borderRadius: 999, borderWidth: 3, borderColor: '#7C5CFC' },
  ringBig: { width: 200, height: 200 },
  ringSmall: { width: 150, height: 150, borderColor: '#2DE1C2' },
  stage: { width: 110, height: 110, alignItems: 'center', justifyContent: 'center' },
  orb: { width: 110, height: 110, borderRadius: 55 },
  orbCore: { position: 'absolute', width: 78, height: 78, borderRadius: 39, backgroundColor: '#0B0A12', alignItems: 'center', justifyContent: 'center' },
  question: { color: '#FFFFFF', fontSize: 40, lineHeight: 46, fontWeight: '900' },
  shine: { position: 'absolute', width: 60, height: 520, backgroundColor: 'rgba(255,255,255,0.10)' },
  caption: { position: 'absolute', top: 64, color: '#FFFFFF', fontSize: 15, lineHeight: 20, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', textAlign: 'center' },
});
