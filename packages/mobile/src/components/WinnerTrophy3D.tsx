import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

// Adel (29/09/2026) : « au lieu de la photo, une animation 3D qui nargue
// l'autre et récompense celui qui a gagné ». Trophée qui tourne en
// perspective sur un socle lumineux. Gagnant : trophée doré + éclat.
// Perdant : même trophée (celui qu'il n'a pas eu) + 😏 qui le nargue.
const NATIVE = Platform.OS !== 'web';

export default function WinnerTrophy3D({ won }: { won: boolean }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const spin = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { if (live) setReduceMotion(Boolean(v)); }).catch(() => {});
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (reduceMotion) return undefined;
    const loops = [
      Animated.loop(Animated.timing(spin, { toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: NATIVE })),
      Animated.loop(Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
        Animated.timing(bob, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
      ])),
      Animated.loop(Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: NATIVE }),
        Animated.timing(glow, { toValue: 0, duration: 900, useNativeDriver: NATIVE }),
      ])),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [reduceMotion, spin, bob, glow]);

  const rotateY = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const lift = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });
  return (
    <View style={s.stage} accessibilityRole="image" accessibilityLabel={won ? 'Trophée du vainqueur' : 'Trophée remporté par ton adversaire'}>
      <Animated.View pointerEvents="none" style={[s.halo, { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [won ? 0.35 : 0.15, won ? 0.8 : 0.3] }) }]} />
      <Animated.View style={{ transform: [{ perspective: 500 }, { translateY: lift }, { rotateY }] }}>
        <Text style={s.trophy}>🏆</Text>
      </Animated.View>
      <View style={s.pedestal} />
      {!won ? (
        <Animated.Text style={[s.taunt, { transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }, { rotate: bob.interpolate({ inputRange: [0, 1], outputRange: ['-10deg', '10deg'] }) }] }]}>😏</Animated.Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  stage: { height: 118, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 110, height: 110, borderRadius: 55, backgroundColor: colors.warning },
  trophy: { fontSize: 64, lineHeight: 76, textAlign: 'center' },
  pedestal: { width: 70, height: 8, borderRadius: 4, backgroundColor: colors.primary, opacity: 0.8, marginTop: 2 },
  taunt: { position: 'absolute', right: '28%', top: 6, fontSize: 30 },
});
