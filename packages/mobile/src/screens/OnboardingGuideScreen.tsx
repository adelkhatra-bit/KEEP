import React, { useState } from 'react';
import { Animated, Dimensions, Easing, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { spacing, radius } from '../theme/spacing';
type OnboardingGuideScreenProps = {
  onComplete?: () => void | Promise<void>;
};

const { width, height } = Dimensions.get('window');

const GUIDE_STEPS = [
  {
    emoji: '🎵',
    tab: 'Loki Music',
    title: 'Reconnaître des chansons',
    description: 'Appuie sur le micro pour reconnaître un titre qui joue autour de toi. Puis GARDER (menthe) pour le sauvegarder ou PASSER (corail) pour continuer.',
    icon: 'microphone',
  },
  {
    emoji: '♫',
    tab: 'Découvertes',
    title: 'Découvrir depuis le profil d\'autres',
    description: 'Glisse entre les profils autour de toi, écoute leurs collections musicales gratuitement et mets en vente tes playlists.',
    icon: 'swap',
  },
  {
    emoji: '☷',
    tab: 'Playlists',
    title: 'Garder ta musique organisée',
    description: 'Sauvegarde, organise et partage tes meilleures trouvailles. Tu peux aussi les vendre à d\'autres.',
    icon: 'collection',
  },
  {
    emoji: '♬',
    tab: 'Soirées',
    title: 'Créer et rejoindre des Battle',
    description: 'Crée une soirée avec ta playlist, invite d\'autres joueurs, et défiez-vous en musique. Les crédits Free servent partout.',
    icon: 'battle',
  },
  {
    emoji: '◯',
    tab: 'Profil',
    title: 'Montrer qui tu es',
    description: 'C\'est ton identité Loki Music. Ajoute ta photo, organise ta musique par style, met en avant tes collections en vente.',
    icon: 'profile',
  },
];

export default function OnboardingGuideScreen({ onComplete }: OnboardingGuideScreenProps) {
  const insets = useSafeAreaInsets();
  const [currentStep, setCurrentStep] = useState(0);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [currentStep]);

  const handleNext = () => {
    if (currentStep < GUIDE_STEPS.length - 1) {
      fadeAnim.setValue(0);
      setCurrentStep(currentStep + 1);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      // Onboarding terminé : appeler le callback
      onComplete?.();
    }
  };

  const handleSkip = () => {
    onComplete?.();
  };

  const step = GUIDE_STEPS[currentStep];

  return (
    <SafeAreaView style={[styles.container, { paddingBottom: insets.bottom }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.subtitle}>Guide Loki Music</Text>
          <Text style={styles.progressText}>{currentStep + 1} sur {GUIDE_STEPS.length}</Text>
        </View>

        {/* Content Card */}
        <Animated.View style={[styles.cardContainer, { opacity: fadeAnim }]}>
          <View style={styles.card}>
            {/* Emoji Icon */}
            <Text style={styles.emoji}>{step.emoji}</Text>

            {/* Tab Name */}
            <Text style={styles.tabName}>Onglet: {step.tab}</Text>

            {/* Title */}
            <Text style={styles.title}>{step.title}</Text>

            {/* Description */}
            <Text style={styles.description}>{step.description}</Text>

            {/* Visual Highlight */}
            <View style={styles.highlightBox}>
              <Text style={styles.highlightText}>💡 Conseil</Text>
              <Text style={styles.highlightContent}>
                {step.tab === 'Loki Music' && 'Tu commences ici. Chaque titre reconnu te coûte 0 Free.'}
                {step.tab === 'Découvertes' && 'Explore d\'autres profils et découvre leurs collections.'}
                {step.tab === 'Playlists' && 'Tes meilleures trouvailles en un seul endroit.'}
                {step.tab === 'Soirées' && 'Invite tes amis et créez des Battle de musique ensemble.'}
                {step.tab === 'Profil' && 'C\'est ta vitrine. Mets en avant ta meilleure musique.'}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Dot Indicators */}
        <View style={styles.dotsContainer}>
          {GUIDE_STEPS.map((_, idx) => (
            <View
              key={idx}
              style={[
                styles.dot,
                {
                  backgroundColor: idx === currentStep ? colors.primary : colors.border,
                },
              ]}
            />
          ))}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
            <Text style={styles.skipButtonText}>Passer</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
            <Text style={styles.nextButtonText}>
              {currentStep === GUIDE_STEPS.length - 1 ? 'Commencer' : 'Suivant'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Footer Info */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Tu peux revoir ce guide depuis Paramètres → À propos.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  header: {
    marginBottom: spacing.xl,
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    letterSpacing: 1,
  },
  progressText: {
    fontSize: 12,
    color: colors.textMutedGrey,
  },
  cardContainer: {
    marginBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emoji: {
    fontSize: 64,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  tabName: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
    marginBottom: spacing.sm,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: colors.textMuted,
    lineHeight: 24,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  highlightBox: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.keep,
  },
  highlightText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.keep,
    marginBottom: spacing.xs,
  },
  highlightContent: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  skipButton: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  skipButtonText: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 14,
  },
  nextButton: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  footer: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: colors.textMutedGrey,
    textAlign: 'center',
    lineHeight: 18,
  },
});
