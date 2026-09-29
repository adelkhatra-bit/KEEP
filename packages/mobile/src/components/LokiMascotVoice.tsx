import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Speech from 'expo-speech';
import { colors } from '../theme/colors';
import { mascotLine } from '../services/battleHomeInfo';

// Adel (29/09/2026) : « un dessin animé avec une voix off, selon le score :
// “Ah zut, c'est dommage, t'aurais pu mieux faire…”, un petit message très
// court, amusant, qu'un enfant de 5 ans serait content d'entendre ».
// Loki = une petite boule violette avec un casque : les yeux clignent, la
// bouche s'anime pendant qu'il parle, il saute de joie ou baisse les
// sourcils selon le résultat. Voix : expo-speech (déjà dans l'appli, donc
// livrable en OTA), voix aiguë façon dessin animé. 🔊 pour réécouter.
const NATIVE = Platform.OS !== 'web';

export default function LokiMascotVoice({ correct, total, allTimeouts = false }: { correct: number; total: number; allTimeouts?: boolean }) {
  const line = mascotLine(correct, total, allTimeouts);
  const [speaking, setSpeaking] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const bounce = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const mouth = useRef(new Animated.Value(0)).current;

  const speak = useCallback(() => {
    try {
      Speech.stop();
      setSpeaking(true);
      Speech.speak(line.text, {
        language: 'fr-FR',
        pitch: 1.45,
        rate: 1.02,
        onDone: () => setSpeaking(false),
        onStopped: () => setSpeaking(false),
        onError: () => setSpeaking(false),
      });
    } catch {
      setSpeaking(false);
    }
  }, [line.text]);

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { if (live) setReduceMotion(Boolean(v)); }).catch(() => {});
    const t = setTimeout(speak, 700);
    return () => { live = false; clearTimeout(t); try { Speech.stop(); } catch {} };
  }, [speak]);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const hop = line.mood === 'party' || line.mood === 'happy';
    const loops = [
      Animated.loop(Animated.sequence([
        Animated.timing(bounce, { toValue: 1, duration: hop ? 380 : 900, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE }),
        Animated.timing(bounce, { toValue: 0, duration: hop ? 380 : 900, easing: Easing.in(Easing.quad), useNativeDriver: NATIVE }),
      ])),
      Animated.loop(Animated.sequence([
        Animated.delay(2200),
        Animated.timing(blink, { toValue: 0.1, duration: 80, useNativeDriver: NATIVE }),
        Animated.timing(blink, { toValue: 1, duration: 90, useNativeDriver: NATIVE }),
      ])),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [reduceMotion, line.mood, bounce, blink]);

  useEffect(() => {
    if (!speaking || reduceMotion) { mouth.setValue(0); return undefined; }
    const talk = Animated.loop(Animated.sequence([
      Animated.timing(mouth, { toValue: 1, duration: 120, useNativeDriver: NATIVE }),
      Animated.timing(mouth, { toValue: 0.2, duration: 110, useNativeDriver: NATIVE }),
    ]));
    talk.start();
    return () => talk.stop();
  }, [speaking, reduceMotion, mouth]);

  const lift = bounce.interpolate({ inputRange: [0, 1], outputRange: [0, line.mood === 'party' || line.mood === 'happy' ? -14 : -4] });
  const sad = line.mood === 'oops' || line.mood === 'sleepy';
  return (
    <View style={s.wrap}>
      <Animated.View style={[s.body, { transform: [{ translateY: lift }] }]} accessibilityRole="image" accessibilityLabel={`Loki dit : ${line.text}`}>
        <View style={[s.ear, s.earLeft]} />
        <View style={[s.ear, s.earRight]} />
        <View style={s.band} />
        <View style={s.brows}>
          <View style={[s.brow, sad && s.browSadLeft]} />
          <View style={[s.brow, sad && s.browSadRight]} />
        </View>
        <View style={s.eyes}>
          {[0, 1].map((i) => (
            <Animated.View key={i} style={[s.eye, { transform: [{ scaleY: line.mood === 'sleepy' ? 0.25 : blink }] }]}>
              <View style={s.pupil} />
            </Animated.View>
          ))}
        </View>
        <Animated.View style={[s.mouth, sad && !speaking && s.mouthSad, { transform: [{ scaleY: speaking ? mouth.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.4] }) : 1 }] }]} />
        {line.mood === 'party' ? <Text style={s.confetti}>🎉</Text> : null}
      </Animated.View>
      <View style={s.bubble}>
        <Text style={s.bubbleText}>{line.text}</Text>
        <TouchableOpacity onPress={speak} hitSlop={8} accessibilityRole="button" accessibilityLabel="Réécouter Loki" style={s.replay}>
          <Text style={s.replayText}>{speaking ? '🔊' : '🔈'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', marginTop: 4 },
  body: { width: 104, height: 104, borderRadius: 52, backgroundColor: colors.primary, borderWidth: 3, borderColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  band: { position: 'absolute', top: -8, width: 92, height: 26, borderTopLeftRadius: 46, borderTopRightRadius: 46, borderWidth: 5, borderBottomWidth: 0, borderColor: '#2A2140' },
  ear: { position: 'absolute', top: 36, width: 20, height: 32, borderRadius: 8, backgroundColor: '#2A2140' },
  earLeft: { left: -10 },
  earRight: { right: -10 },
  brows: { position: 'absolute', top: 24, flexDirection: 'row', gap: 22 },
  brow: { width: 16, height: 4, borderRadius: 2, backgroundColor: '#1B1230' },
  browSadLeft: { transform: [{ rotate: '-18deg' }] },
  browSadRight: { transform: [{ rotate: '18deg' }] },
  eyes: { flexDirection: 'row', gap: 16, marginTop: -4 },
  eye: { width: 22, height: 24, borderRadius: 11, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  pupil: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#1B1230' },
  mouth: { marginTop: 8, width: 26, height: 12, borderBottomLeftRadius: 13, borderBottomRightRadius: 13, backgroundColor: '#1B1230' },
  mouthSad: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderTopLeftRadius: 13, borderTopRightRadius: 13, height: 8 },
  confetti: { position: 'absolute', right: -18, top: -14, fontSize: 26 },
  bubble: { marginTop: 10, maxWidth: 320, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.primaryLight },
  bubbleText: { flexShrink: 1, color: colors.textPrimary, fontSize: 14, lineHeight: 19, fontWeight: '800', textAlign: 'center' },
  replay: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundCard },
  replayText: { fontSize: 16 },
});
