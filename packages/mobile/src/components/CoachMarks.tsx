import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';

// Maquette validee (docs/mockups/CoachMarks.html, 24/09/2026) : mini-tour
// d'aide au premier lancement. Devise Adel : "compris en 2 clics". Cinq
// bulles maximum, l'utilisateur peut passer a tout moment. Composant 100 %
// autonome (aucun toucher a Navigation.tsx / App.tsx) : il s'affiche par
// dessus l'ecran d'accueil via un Modal transparent. 100 % JS/Animated donc
// livrable en OTA (eas update). Ne supprime rien : c'est un ajout par dessus.

export type CoachStep = {
  emoji: string;
  title: string;
  body: string;
};

// Contenu par defaut : couvre les fonctions cles reperees a l'audit UX
// (GARDER 1 clic, PASSER, Decouverte/vente, Soirees/Battle, credits Free).
export const DEFAULT_COACH_STEPS: CoachStep[] = [
  {
    emoji: '👋',
    title: 'Bienvenue sur Loki Music',
    body: "« Compris en 2 clics » : on te montre l'essentiel. Tu peux passer quand tu veux.",
  },
  {
    emoji: '♡',
    title: 'Garder un morceau = 1 clic',
    body: "Un titre te plaît ? Appuie sur GARDER (menthe) : il est enregistré en public direct. Appui long ou ⚙︎ pour choisir public ou privé.",
  },
  {
    emoji: '✕',
    title: 'Passer, c’est le corail',
    body: "Pas pour toi ? PASSER (corail). Tu peux aussi glisser la carte : ← passer, garder →.",
  },
  {
    emoji: '🏷️',
    title: 'Découvre et vends',
    body: "Découverte : d'autres profils près de toi. Ta Musique : garde, range, et mets tes playlists en vente (badge « En vente »).",
  },
  {
    emoji: '⚔️',
    title: 'Soirées & Battle',
    body: "Crée ou rejoins une soirée, partage sa playlist, défie les autres en Battle. Tes crédits Free servent partout.",
  },
];

type Props = {
  visible: boolean;
  steps?: CoachStep[];
  onFinish: () => void;
};

export default function CoachMarks({ visible, steps = DEFAULT_COACH_STEPS, onFinish }: Props) {
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    if (!visible) return;
    setIndex(0);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    fade.setValue(0);
    slide.setValue(12);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 220, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 240, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
  }, [index, visible, fade, slide]);

  if (!visible) return null;

  const total = steps.length;
  const step = steps[index];
  const isLast = index >= total - 1;

  const goNext = () => {
    if (isLast) { onFinish(); return; }
    setIndex((v) => Math.min(v + 1, total - 1));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onFinish}>
      <View style={s.overlay}>
        <Animated.View style={[s.bubble, { opacity: fade, transform: [{ translateY: slide }] }]}>
          <Text style={s.badge}>{`Étape ${index + 1} / ${total}`}</Text>
          <Text style={s.emoji}>{step.emoji}</Text>
          <Text style={s.title}>{step.title}</Text>
          <Text style={s.body}>{step.body}</Text>
          <View style={s.dots}>
            {steps.map((_, k) => <View key={k} style={[s.dot, k === index && s.dotOn]} />)}
          </View>
          <View style={s.actions}>
            <TouchableOpacity onPress={onFinish} accessibilityRole="button" accessibilityLabel="Passer le mini-tour">
              <Text style={s.skip}>Passer</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.next, isLast && s.nextFinal]} onPress={goNext} accessibilityRole="button" accessibilityLabel={isLast ? 'Terminer le mini-tour' : 'Étape suivante'}>
              <Text style={[s.nextText, isLast && s.nextFinalText]}>{isLast ? "C'est parti ✓" : 'Suivant →'}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
        <Text style={s.footHint}>Ne s'affiche qu'une fois. Ré-affichable depuis Réglages → Aide.</Text>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(5,4,10,0.82)', justifyContent: 'flex-end', padding: spacing.lg },
  bubble: { backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.lg },
  badge: { alignSelf: 'flex-start', backgroundColor: 'rgba(124,92,252,0.18)', color: colors.primary, fontSize: 12, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, overflow: 'hidden', marginBottom: spacing.md },
  emoji: { fontSize: 34, marginBottom: spacing.sm },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '900', marginBottom: spacing.sm },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: spacing.lg },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginBottom: spacing.md },
  dot: { width: 7, height: 7, borderRadius: 5, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.keep, width: 20 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  skip: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
  next: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingHorizontal: 26, paddingVertical: 13 },
  nextText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  nextFinal: { backgroundColor: colors.keep },
  nextFinalText: { color: colors.background },
  footHint: { color: colors.textMuted, textAlign: 'center', fontSize: 12, marginTop: spacing.lg },
});
