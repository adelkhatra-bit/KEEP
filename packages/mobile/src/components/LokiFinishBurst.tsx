import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

// Adel (29/09/2026) : « à la fin des Solos et des matchs, pas d'animation…
// une animation spéciale Loki ». Signature de fin de partie :
// - le mot LOKI en relief (3 couches décalées = profondeur) qui arrive en
//   ressort puis pivote en perspective (effet 3D) ;
// - 3 ondes de choc colorées qui partent du centre ;
// - des éclats musicaux (♪ ✦ ◆) projetés en cercle.
// Pilote natif désactivé sur le web (règle WebAnimationDriver) ; si
// l'appareil demande moins d'animations, le logo s'affiche simplement.
const NATIVE = Platform.OS !== 'web';
const SHARDS = ['♪', '✦', '◆', '♫', '✦', '♪', '◆', '✦', '♫', '◆', '✦', '♪'];
const RING_COLORS = [colors.primaryLight, colors.success, colors.warning];

export default function LokiFinishBurst({ tone = 'win' }: { tone?: 'win' | 'try' }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const enter = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const rings = useRef(RING_COLORS.map(() => new Animated.Value(0))).current;
  const burst = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { if (live) setReduceMotion(Boolean(v)); }).catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (reduceMotion) { enter.setValue(1); return undefined; }
    enter.setValue(0); spin.setValue(0); burst.setValue(0); rings.forEach((r) => r.setValue(0));
    const intro = Animated.parallel([
      Animated.spring(enter, { toValue: 1, friction: 5, tension: 70, useNativeDriver: NATIVE }),
      Animated.timing(burst, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }),
      Animated.stagger(180, rings.map((r) => Animated.timing(r, { toValue: 1, duration: 1200, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE }))),
    ]);
    const sway = Animated.loop(Animated.sequence([
      Animated.timing(spin, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
      Animated.timing(spin, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
    ]));
    intro.start();
    sway.start();
    return () => { intro.stop(); sway.stop(); };
  }, [reduceMotion, enter, spin, burst, rings]);

  const rotateY = spin.interpolate({ inputRange: [0, 1], outputRange: ['-22deg', '22deg'] });
  const rotateX = spin.interpolate({ inputRange: [0, 1], outputRange: ['8deg', '-8deg'] });
  const scale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });
  const accent = tone === 'win' ? colors.success : colors.primaryLight;

  return (
    <View style={s.stage} accessibilityRole="image" accessibilityLabel="Animation Loki Music de fin de partie">
      {!reduceMotion ? rings.map((r, i) => (
        <Animated.View key={`ring-${i}`} pointerEvents="none" style={[s.ring, { borderColor: RING_COLORS[i], opacity: r.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.8, 0] }), transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [0.3, 2.1] }) }] }]} />
      )) : null}
      {!reduceMotion ? SHARDS.map((shard, i) => {
        const angle = (i / SHARDS.length) * Math.PI * 2;
        const dist = 78 + (i % 3) * 14;
        return (
          <Animated.Text key={`shard-${i}`} pointerEvents="none" style={[s.shard, { color: RING_COLORS[i % RING_COLORS.length], opacity: burst.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 1, 0] }), transform: [
            { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * dist] }) },
            { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * dist] }) },
            { rotate: burst.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${(i % 2 ? 1 : -1) * 220}deg`] }) },
          ] }]}>{shard}</Animated.Text>
        );
      }) : null}
      <Animated.View style={{ transform: [{ perspective: 600 }, { scale }, { rotateY }, { rotateX }] }}>
        <View>
          <Text style={[s.word, s.depthFar]}>LOKI</Text>
          <Text style={[s.word, s.depthMid, { color: accent }]}>LOKI</Text>
          <Text style={[s.word, s.face]}>LOKI</Text>
        </View>
        <Text style={[s.music, { color: accent }]}>MUSIC</Text>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  stage: { height: 164, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ring: { position: 'absolute', width: 96, height: 96, borderRadius: 48, borderWidth: 3 },
  shard: { position: 'absolute', fontSize: 18, fontWeight: '900' },
  word: { fontSize: 52, lineHeight: 60, fontWeight: '900', letterSpacing: 6, textAlign: 'center' },
  depthFar: { position: 'absolute', left: 6, top: 6, color: colors.primary, opacity: 0.55 },
  depthMid: { position: 'absolute', left: 3, top: 3 },
  face: { color: '#FFFFFF' },
  music: { fontSize: 16, fontWeight: '900', letterSpacing: 10, textAlign: 'center', marginTop: -2, marginLeft: 10 },
});
