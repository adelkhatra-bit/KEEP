import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { mascotLine, type MascotMood } from '../services/battleHomeInfo';
import { speakLokiText, stopLokiSpeech } from '../services/lokiSpeechService';

// Adel (29/09/2026) : « un dessin animé avec une voix off, selon le score :
// “Ah zut, c'est dommage, t'aurais pu mieux faire…”, un petit message très
// court, amusant, qu'un enfant de 5 ans serait content d'entendre ».
// Loki = une petite boule violette avec un casque : les yeux clignent, la
// bouche s'anime pendant qu'il parle, il saute de joie ou baisse les
// sourcils selon le résultat. La voix utilise le service Loki sans dépendance
// native supplémentaire afin de rester compatible avec le binaire installé.
const NATIVE = Platform.OS !== 'web';

type LokiMascotVoiceProps = {
  correct: number;
  total: number;
  allTimeouts?: boolean;
  textOverride?: string;
  moodOverride?: MascotMood;
  messageSeed?: string;
  compact?: boolean;
};

export default function LokiMascotVoice({ correct, total, allTimeouts = false, textOverride, moodOverride, messageSeed = '', compact = false }: LokiMascotVoiceProps) {
  const defaultLine = mascotLine(correct, total, allTimeouts, messageSeed);
  const line = textOverride ? { text: textOverride, mood: moodOverride ?? defaultLine.mood } : defaultLine;
  const [speaking, setSpeaking] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const bounce = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const mouth = useRef(new Animated.Value(0)).current;
  const speak = useCallback(async () => {
    try {
      await stopLokiSpeech().catch(() => {});
      setSpeaking(true);
      // Le service Loki est l'unique propriétaire du ducking/restauration.
      // Éviter un deuxième jeton ici : deux duckings imbriqués pouvaient
      // laisser la preview bloquée à faible volume après la voix.
      await speakLokiText(line.text, { language: 'fr-FR', pitch: 1.02, rate: 0.94 });
    } catch {
      // Voice is optional.
    } finally {
      setSpeaking(false);
    }
  }, [line.text]);

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { if (live) setReduceMotion(Boolean(v)); }).catch(() => {});
    const t = setTimeout(() => { void speak(); }, 320);
    return () => {
      live = false;
      clearTimeout(t);
      void stopLokiSpeech().catch(() => {});
    };
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
  if (compact) {
    return (
      <View style={s.compactWrap}>
        <View style={[s.bubble, s.compactBubble]}>
          <Text style={s.bubbleText}>{line.text}</Text>
          <TouchableOpacity onPress={speak} hitSlop={8} accessibilityRole="button" accessibilityLabel="Réécouter Loki Music" style={s.replay}>
            <Text style={s.replayText}>{speaking ? '🔊' : '🔈'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={s.wrap}>
      <Animated.View style={[s.body, { transform: [{ translateY: lift }] }]} accessibilityRole="image" accessibilityLabel={`Loki Music dit : ${line.text}`}>
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
        <TouchableOpacity onPress={speak} hitSlop={8} accessibilityRole="button" accessibilityLabel="Réécouter Loki Music" style={s.replay}>
          <Text style={s.replayText}>{speaking ? '🔊' : '🔈'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', marginTop: 4 },
  compactWrap: { width: '100%', alignItems: 'center', marginTop: 4 },
  compactBubble: { maxWidth: 340, width: '100%' },
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
