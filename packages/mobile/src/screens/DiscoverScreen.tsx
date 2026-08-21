import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';

/**
 * Onglet DÉCOUVRIR (§25).
 *
 * STATUT HONNÊTE : la personnalisation réelle (goûts, follows, tendances,
 * localisation, événements) nécessite le backend Supabase + des utilisateurs
 * réels — non branché à ce stade (voir docs/PROJECT_STATUS.md, statut PLANNED).
 * Cet écran est donc un état vide explicite plutôt qu'un faux flux de
 * recommandations pour ne pas afficher un résultat trompeur.
 */
export default function DiscoverScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('nav.discover')}</Text>

        <View style={styles.placeholderCard}>
          <Text style={styles.placeholderEmoji}>🧭</Text>
          <Text style={styles.placeholderTitle}>{t('common.comingSoon')}</Text>
          <Text style={styles.placeholderBody}>
            La découverte personnalisée (profils, événements, DJ proches) s'active une fois le
            backend connecté et de vrais utilisateurs présents. Statut : PLANNED.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, flexGrow: 1 },
  title: { ...typography.h1, color: colors.textPrimary, marginBottom: spacing.xl },
  placeholderCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
  },
  placeholderEmoji: { fontSize: 40, marginBottom: spacing.md },
  placeholderTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.sm },
  placeholderBody: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19 },
});
