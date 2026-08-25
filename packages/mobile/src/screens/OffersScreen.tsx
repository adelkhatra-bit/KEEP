import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useUserStore } from '../store/useUserStore';
import { CreditFunnel, KeepPlan, loadCreditFunnel, loadCurrentPlanCode, loadPlans } from '../services/planService';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';

const BENEFITS: Record<string, string[]> = {
  FREE: [
    'Découvrir KEEP et commencer à partager tes goûts musicaux',
    '3 téléchargements avant inscription',
    '+4 téléchargements offerts après création du compte',
    'Profil public, KEEP DNA et réseau musical',
  ],
  PREMIUM: [
    'Pour écouter, garder et classer ta musique au quotidien',
    'Synchronisation multi-plateformes étendue',
    'Historique complet et usage plus confortable',
    'Développer une communauté autour de tes goûts musicaux',
  ],
  CREATOR_PRO: [
    'Pensé pour artistes, DJ et créateurs',
    'Transformer tes goûts musicaux en contenu suivi par ta communauté',
    'Analytics et fonctions créateur avancées',
    'Événements et visibilité supplémentaires',
  ],
  VENUE_PRO: [
    'Pour établissements et événements',
    'Expériences musicales partagées avec le public',
    'Analytics de fréquentation et QR',
    'Outils professionnels illimités selon le plan actif',
  ],
};

function money(plan: KeepPlan) {
  if (plan.monthlyAmount === 0) return 'Gratuit';
  return `${plan.monthlyAmount.toFixed(2).replace('.', ',')} € / mois`;
}

export default function OffersScreen({ navigation }: any) {
  const user = useUserStore((s) => s.user);
  const [plans, setPlans] = useState<KeepPlan[]>([]);
  const [funnel, setFunnel] = useState<CreditFunnel>({ guestSuccessLimit: 3, signupBonusSuccesses: 4 });
  const [currentPlan, setCurrentPlan] = useState('FREE');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [livePlans, liveFunnel, planCode] = await Promise.all([
          loadPlans(),
          loadCreditFunnel(),
          user ? loadCurrentPlanCode(user.id) : Promise.resolve('FREE'),
        ]);
        if (cancelled) return;
        setPlans(livePlans);
        setFunnel(liveFunnel);
        setCurrentPlan(planCode || 'FREE');
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Impossible de charger les offres.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const freeTotal = useMemo(() => funnel.guestSuccessLimit + funnel.signupBonusSuccesses, [funnel]);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Retour"><Text style={s.back}>‹</Text></TouchableOpacity>
        <View style={s.headerText}><Text style={s.title}>Offre & crédits</Text><Text style={s.subtitle}>Ton plan actuel : {currentPlan}</Text></View>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.promiseCard}>
          <Text style={s.promiseEyebrow}>KEEP</Text>
          <Text style={s.promiseTitle}>Partage tes goûts musicaux. Crée ta communauté.</Text>
          <Text style={s.promiseBody}>Tes abonnés peuvent découvrir les artistes, albums et morceaux que tu gardes, même s’ils ne suivent pas forcément ta propre musique.</Text>
        </View>

        <View style={s.creditCard}>
          <Text style={s.sectionTitle}>Essai gratuit</Text>
          <Text style={s.creditBig}>{funnel.guestSuccessLimit} + {funnel.signupBonusSuccesses} = {freeTotal}</Text>
          <Text style={s.creditText}>{funnel.guestSuccessLimit} téléchargements avant inscription, puis {funnel.signupBonusSuccesses} supplémentaires offerts après création du compte.</Text>
          <Text style={s.creditRule}>Écouter, reconnaître et PASSER ne consomment aucun crédit. Seul un téléchargement/GARDER réellement effectué consomme un crédit.</Text>
        </View>

        {loading ? <ActivityIndicator color={colors.primaryLight} /> : error ? <Text style={s.error}>{error}</Text> : plans.map((plan) => {
          const active = plan.code === currentPlan;
          return (
            <View key={plan.code} style={[s.planCard, active && s.planCardActive]}>
              <View style={s.planTop}>
                <View>
                  <Text style={s.planName}>{plan.name}</Text>
                  <Text style={s.planPrice}>{money(plan)}</Text>
                </View>
                {active ? <View style={s.currentBadge}><Text style={s.currentBadgeText}>ACTUEL</Text></View> : null}
              </View>
              {!!plan.description && <Text style={s.planDescription}>{plan.description}</Text>}
              {(BENEFITS[plan.code] || []).map((benefit) => <Text key={benefit} style={s.benefit}>• {benefit}</Text>)}
              {plan.trialDays > 0 ? <Text style={s.trial}>Essai : {plan.trialDays} jours</Text> : null}
              {!active && plan.code !== 'FREE' ? (
                <TouchableOpacity style={s.cta} onPress={() => {}} accessibilityRole="button">
                  <Text style={s.ctaText}>En savoir plus</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: 58, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { color: colors.textPrimary, fontSize: 36, lineHeight: 40, width: 42 },
  headerText: { flex: 1, alignItems: 'center' },
  title: { ...typography.h3, color: colors.textPrimary },
  subtitle: { color: colors.primaryLight, fontSize: 11, fontWeight: '800', marginTop: 2 },
  headerSpacer: { width: 42 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  promiseCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: '#151020', borderWidth: 1, borderColor: '#493369' },
  promiseEyebrow: { color: colors.primaryLight, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  promiseTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '900', lineHeight: 25, marginTop: 5 },
  promiseBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 8 },
  creditCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: '#1A1225', borderWidth: 1, borderColor: colors.primary },
  sectionTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '900' },
  creditBig: { color: colors.primaryLight, fontSize: 28, fontWeight: '900', marginTop: 8 },
  creditText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
  creditRule: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 8 },
  planCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border },
  planCardActive: { borderColor: colors.primaryLight },
  planTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planName: { color: colors.textPrimary, fontSize: 17, fontWeight: '900' },
  planPrice: { color: colors.primaryLight, fontSize: 13, fontWeight: '800', marginTop: 3 },
  currentBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.smartBadgeBg },
  currentBadgeText: { color: colors.smartBadgeText, fontSize: 9, fontWeight: '900' },
  planDescription: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 10, marginBottom: 6 },
  benefit: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
  trial: { color: colors.keep, fontSize: 11, fontWeight: '800', marginTop: 8 },
  cta: { minHeight: 44, borderRadius: 22, marginTop: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  ctaText: { color: colors.white, fontSize: 13, fontWeight: '900' },
  error: { color: colors.danger, textAlign: 'center', paddingVertical: 20 },
});
