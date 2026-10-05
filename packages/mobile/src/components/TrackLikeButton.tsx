import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export type ReactionKind = 'LIKE' | 'MEH' | 'DISLIKE';

/**
 * Réactions d'une musique, composant unique de l'application (Adel, 05/10/2026, IDEA-110) : trois boutons « 3D » glossy — pas aimé 👎, bof 😐, aimé ❤ —
 * qui flottent doucement (bascule en perspective) tant qu'on n'a pas donné son avis, pour qu'on comprenne qu'on peut réagir.
 * Une seule réaction par musique : une fois donnée, seul le bouton choisi reste ALLUMÉ (rouge / ambre / violet) et on ne redemande pas ;
 * un appui sur ce bouton allumé retire l'avis (changer d'avis / des-aimer) et les trois choix reviennent.
 */
const OPTIONS: Array<{ kind: ReactionKind; glyph: string; lit: [string, string]; rim: string; label: string; done: string; suffix: string }> = [
  { kind: 'DISLIKE', glyph: '👎', lit: ['#9B7BFF', '#5B3FD1'], rim: '#B79CFF', label: 'Je n’aime pas cette musique', done: 'Tu n’as pas aimé cette musique', suffix: '-dislike' },
  { kind: 'MEH', glyph: '😐', lit: ['#FFC857', '#D98E04'], rim: '#FFD98A', label: 'Bof, cette musique', done: 'Tu as trouvé cette musique bof', suffix: '-meh' },
  { kind: 'LIKE', glyph: '❤', lit: ['#FF5C7A', '#C4163A'], rim: '#FF8FA3', label: 'J’aime cette musique', done: 'Tu aimes cette musique', suffix: '' },
];
const IDLE: [string, string] = ['#2F2C45', '#1A1830'];

function ReactionOrb({ option, active, dimmed, onPress, count, testID, delay, calm }: { option: (typeof OPTIONS)[number]; active: boolean; dimmed: boolean; onPress?: () => void; count: number; testID: string; delay: number; calm: boolean }) {
  const float = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => {
    if (active || dimmed || calm) { float.setValue(0.5); return undefined; }
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(float, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [float, active, dimmed, calm, delay]);
  useEffect(() => {
    if (active) Animated.spring(pop, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }).start();
  }, [active, pop]);
  const rotateY = float.interpolate({ inputRange: [0, 1], outputRange: ['-24deg', '24deg'] });
  const lift = float.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -3, 0] });
  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !onPress }}
      accessibilityLabel={active ? `${option.done}. Appuie pour changer d’avis` : option.label}
      testID={testID}
      style={dimmed ? s.dimmed : undefined}
    >
      <Animated.View style={[s.orbShadow, active && { shadowColor: option.rim, shadowOpacity: 0.95, shadowRadius: 12, elevation: 10 }, { transform: [{ perspective: 520 }, { translateY: lift }, { rotateY }, { scale }] }]}>
        <LinearGradient colors={active ? option.lit : IDLE} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[s.orb, { borderColor: active ? option.rim : '#5B5870' }]}>
          <LinearGradient colors={['rgba(255,255,255,.42)', 'rgba(255,255,255,0)']} start={{ x: 0.1, y: 0 }} end={{ x: 0.7, y: 0.8 }} style={s.gloss} pointerEvents="none" />
          <Text style={[s.glyph, !active && s.glyphIdle, option.kind === 'LIKE' && !active && s.heartIdle]}>{option.glyph}</Text>
        </LinearGradient>
        {count > 0 && active ? <Text style={s.count} testID="deck-like-badge-count">{count}</Text> : null}
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function TrackLikeButton({ reaction, count, onReact, onClear, testID = 'deck-like-button' }: { reaction: ReactionKind | null; count: number; onReact: (kind: ReactionKind) => void; onClear?: () => void; testID?: string }) {
  const [calm, setCalm] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((value) => { if (live) setCalm(Boolean(value)); }).catch(() => {});
    return () => { live = false; };
  }, []);
  // Déjà réagi : seul le bouton choisi reste allumé, on ne redemande pas.
  if (reaction) {
    const option = OPTIONS.find((item) => item.kind === reaction)!;
    return <View style={s.row}><ReactionOrb option={option} active dimmed={false} onPress={onClear} count={count} testID={`${testID}${option.suffix}`} delay={0} calm /></View>;
  }
  return (
    <View style={s.row} testID={`${testID}-trio`}>
      {OPTIONS.map((option, index) => (
        <ReactionOrb key={option.kind} option={option} active={false} dimmed={false} onPress={() => onReact(option.kind)} count={0} testID={`${testID}${option.suffix}`} delay={index * 380} calm={calm} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orbShadow: { width: 42, height: 42, borderRadius: 21, shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  orb: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 2, overflow: 'hidden' },
  gloss: { position: 'absolute', top: 0, left: 0, right: 0, height: 22, borderTopLeftRadius: 21, borderTopRightRadius: 21 },
  glyph: { fontSize: 20, lineHeight: 24, color: '#FFFFFF' },
  glyphIdle: { opacity: 0.75 },
  heartIdle: { color: '#FFFFFF' },
  dimmed: { opacity: 0.35 },
  count: { position: 'absolute', right: -5, bottom: -5, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: '#FF2D55', color: '#FFFFFF', fontSize: 11, lineHeight: 18, fontWeight: '900', textAlign: 'center', overflow: 'hidden' },
});
