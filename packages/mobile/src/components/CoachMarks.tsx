import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';

// Maquette validee (docs/mockups/CoachMarks.html, 24/09/2026) : mini-tour
// d'aide au premier lancement. Devise Adel : "compris en 2 clics". Cinq
// bulles maximum, l'utilisateur peut passer a tout moment. Composant 100 %
// autonome (aucun toucher a Navigation.tsx / App.tsx) : il s'affiche DANS
// le vrai ecran Ecouter, jamais dans une page/modale noire separee. La barre
// des 5 onglets reste donc visible. 100 % JS/Animated, livrable en OTA.

export type CoachStep = {
  emoji: string;
  title: string;
  body: string;
};

// Contenu par defaut : couvre les fonctions cles reperees a l'audit UX
// (reconnaissance musicale, playlists, boutique, Solo/Battle, crédits FREE).
export const DEFAULT_COACH_STEPS: CoachStep[] = [
  {
    emoji: '🎵',
    title: 'Bienvenue sur Loki Music',
    body: "Découvre la musique autour de toi. Tu peux passer cette visite à tout moment.",
  },
  {
    emoji: '🔎',
    title: 'Trouver le morceau',
    body: "Identifie le titre autour de toi. Retrouve ton quota de recherches et tes FREE dans ton compte.",
  },
  {
    emoji: '🎧',
    title: 'Explore et écoute',
    body: "Découvre des titres et des profils. Passe facilement au morceau suivant.",
  },
  {
    emoji: '🛍️',
    title: 'Ta musique et la boutique',
    body: "Retrouve tes morceaux, organise tes playlists et explore les titres proposés dans les boutiques.",
  },
  {
    emoji: '🎤',
    title: 'Solo, Battle et soirées',
    body: "Joue en Solo, participe aux Battles et prépare tes soirées. Tes droits et recharges dépendent de ta formule.",
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
        {/* Dans la bulle (29/09/2026) : posé sous la bulle, ce texte passait
            par-dessus les libellés de la barre des 5 onglets. */}
        <Text style={s.footHint}>Ne s'affiche qu'une fois. Ré-affichable depuis Réglages → Aide.</Text>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 50, backgroundColor: 'rgba(5,4,10,0.08)', justifyContent: 'flex-end', alignItems: 'center', padding: spacing.lg },
  bubble: { width: '100%', maxWidth: 520, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.lg },
  badge: { alignSelf: 'flex-start', backgroundColor: 'rgba(124,92,252,0.18)', color: colors.primaryLight, fontSize: 12, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, overflow: 'hidden', marginBottom: spacing.md },
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
