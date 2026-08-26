import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useUserStore } from '../store/useUserStore';
import { CreditFunnel, KeepPlan, loadCreditFunnel, loadCurrentPlanCode, loadPlans } from '../services/planService';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';

const BENEFITS: Record<string, string[]> = {
  FREE: [
    'Découvrir KEEP, identifier les morceaux autour de toi et construire ton KEEP DNA',
    '3 téléchargements avant inscription',
    '+4 téléchargements offerts après création du compte',
    'Visibilité limitée : partage public, QR KEEP et playlists publiques restent verrouillés',
  ],
  PREMIUM: [
    'Débloque le partage public du profil et le QR KEEP',
    'Rend tes playlists et les morceaux que tu gardes visibles à ta communauté',
    'KEEP, abonnements et comparaisons sans quota mensuel prévu',
    'Jusqu’à 3 services musicaux connectés',
  ],
  CREATOR_PRO: [
    'Inclut toutes les fonctions Premium',
    'Profils DJ, Artiste, Créateur ou Producteur',
    'Création d’événements et notifications aux abonnés',
    'Analytics et fonctions créateur avancées',
  ],
  VENUE_PRO: [
    'Inclut les fonctions Creator Pro disponibles pour les lieux',
    'Profil Lieu / établissement',
    'Événements, communauté, QR et visibilité professionnelle',
    'Outils et analytics dédiés aux établissements',
  ],
};

function money(plan: KeepPlan) {
  if (plan.monthlyAmount === 0) return 'Gratuit';
  return `${plan.monthlyAmount.toFixed(2).replace('.', ',')} € / mois`;
}

function planLabel(code: string) {
  if (code === 'CREATOR_PRO') return 'Creator Pro';
  if (code === 'VENUE_PRO') return 'Venue Pro';
  if (code === 'PREMIUM') return 'Premium';
  return code === 'FREE' ? 'Free' : code.replace(/_/g, ' ');
}

function requiredReason(feature: string, plan: string) {
  if (feature === 'PROFILE_SHARE') return 'Cette formule débloque le partage public, le QR KEEP et la visibilité de tes playlists.';
  if (feature === 'CREATOR_KIND') return 'Cette formule débloque les profils DJ, Artiste, Créateur et Producteur.';
  if (feature === 'CREATE_EVENT') return 'Cette formule débloque la création d’événements et les notifications à tes abonnés.';
  if (feature === 'VENUE_KIND') return 'Cette formule débloque le profil Lieu / établissement et ses outils professionnels.';
  return `${planLabel(plan)} est la formule requise pour cette fonction.`;
}

export default function OffersScreen({ navigation, route }: any) {
  const user = useUserStore((s) => s.user);
  const focusPlan = String(route?.params?.focusPlan || '').toUpperCase();
  const sourceFeature = String(route?.params?.sourceFeature || '').toUpperCase();
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
  const visiblePlans = useMemo(() => focusPlan ? plans.filter((plan) => plan.code === focusPlan) : plans, [focusPlan, plans]);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Retour"><Text style={s.back}>‹</Text></TouchableOpacity>
        <View style={s.headerText}>
          <Text style={s.title}>Offre & crédits</Text>
          <Text style={s.subtitle}>{focusPlan ? `Formule requise : ${planLabel(focusPlan)}` : `Ton plan actuel : ${currentPlan}`}</Text>
        </View>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {focusPlan ? <View style={s.requiredIntro}>
          <Text style={s.requiredIntroEyebrow}>FONCTION VERROUILLÉE</Text>
          <Text style={s.requiredIntroTitle}>{planLabel(focusPlan)}</Text>
          <Text style={s.requiredIntroText}>{requiredReason(sourceFeature, focusPlan)}</Text>
        </View> : <>
          <View style={s.promiseCard}>
            <Text style={s.promiseEyebrow}>KEEP</Text>
            <Text style={s.promiseTitle}>Partage tes goûts musicaux. Crée ta communauté.</Text>
            <Text style={s.promiseBody}>KEEP identifie les morceaux entendus autour de toi et construit ton identité musicale. Ce n’est pas une plateforme de streaming : les fonctions de visibilité et de communauté se débloquent avec les formules adaptées.</Text>
          </View>

          <View style={s.creditCard}>
            <Text style={s.sectionTitle}>Essai gratuit</Text>
            <Text style={s.creditBig}>{funnel.guestSuccessLimit} + {funnel.signupBonusSuccesses} = {freeTotal}</Text>
            <Text style={s.creditText}>{funnel.guestSuccessLimit} téléchargements avant inscription, puis {funnel.signupBonusSuccesses} supplémentaires offerts après création du compte.</Text>
            <Text style={s.creditRule}>Détecter, reconnaître un morceau et PASSER ne consomment aucun crédit. Seul GARDER/télécharger réellement un morceau consomme un crédit.</Text>
          </View>
        </>}

        {loading ? <ActivityIndicator color={colors.primaryLight} /> : error ? <Text style={s.error}>{error}</Text> : visiblePlans.map((plan) => {
          const active = plan.code === currentPlan;
          const focused = !!focusPlan && plan.code === focusPlan;
          return (
            <View key={plan.code} style={[s.planCard, active && s.planCardActive, focused && s.planCardFocused]}>
              <View style={s.planTop}>
                <View>
                  <Text style={s.planName}>{plan.name}</Text>
                  <Text style={s.planPrice}>{money(plan)}</Text>
                </View>
                {active ? <View style={s.currentBadge}><Text style={s.currentBadgeText}>ACTUEL</Text></View> : focused ? <View style={s.requiredBadge}><Text style={s.requiredBadgeText}>FORMULE REQUISE</Text></View> : null}
              </View>
              {!!plan.description && <Text style={s.planDescription}>{plan.description}</Text>}
              {(BENEFITS[plan.code] || []).map((benefit) => <Text key={benefit} style={s.benefit}>• {benefit}</Text>)}
              {plan.code !== 'FREE' ? <Text style={s.unlimited}>Fonctions incluses disponibles pendant toute la durée de l’abonnement, sans achat à l’unité.</Text> : null}
              {plan.trialDays > 0 ? <Text style={s.trial}>Essai : {plan.trialDays} jours</Text> : null}
              {!active && plan.code !== 'FREE' ? (
                <TouchableOpacity style={s.cta} onPress={() => {}} accessibilityRole="button">
                  <Text style={s.ctaText}>{focused ? `Choisir ${planLabel(plan.code)}` : 'En savoir plus'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}

        <View style={s.subscriptionCard}>
          <Text style={s.subscriptionTitle}>Sans engagement</Text>
          <Text style={s.subscriptionText}>Abonnement mensuel. Tu peux arrêter à tout moment. Les avantages restent actifs jusqu’à la fin de la période déjà payée, puis les fonctions payantes se reverrouillent automatiquement. Ton compte, ton profil et tes données restent conservés.</Text>
        </View>

        {focusPlan ? <TouchableOpacity style={s.allPlans} onPress={() => navigation.setParams({ focusPlan: undefined, sourceFeature: undefined })}>
          <Text style={s.allPlansText}>Voir toutes les formules</Text>
        </TouchableOpacity> : null}
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
  requiredIntro: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: '#1A1225', borderWidth: 1, borderColor: colors.primaryLight },
  requiredIntroEyebrow: { color: colors.primaryLight, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  requiredIntroTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: '900', marginTop: 5 },
  requiredIntroText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 7 },
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
  planCardFocused: { borderColor: colors.primaryLight, borderWidth: 2 },
  planTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planName: { color: colors.textPrimary, fontSize: 17, fontWeight: '900' },
  planPrice: { color: colors.primaryLight, fontSize: 13, fontWeight: '800', marginTop: 3 },
  currentBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.smartBadgeBg },
  currentBadgeText: { color: colors.smartBadgeText, fontSize: 9, fontWeight: '900' },
  requiredBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: '#3D2860', borderWidth: 1, borderColor: colors.primaryLight },
  requiredBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '900' },
  planDescription: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 10, marginBottom: 6 },
  benefit: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
  unlimited: { color: colors.keep, fontSize: 10, lineHeight: 15, fontWeight: '800', marginTop: 10 },
  trial: { color: colors.keep, fontSize: 11, fontWeight: '800', marginTop: 8 },
  cta: { minHeight: 44, borderRadius: 22, marginTop: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  ctaText: { color: colors.white, fontSize: 13, fontWeight: '900' },
  subscriptionCard: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: '#151020', borderWidth: 1, borderColor: '#3D324A' },
  subscriptionTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '900' },
  subscriptionText: { color: colors.textMuted, fontSize: 10, lineHeight: 16, marginTop: 5 },
  allPlans: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  allPlansText: { color: colors.primaryLight, fontSize: 12, fontWeight: '900' },
  error: { color: colors.danger, textAlign: 'center', paddingVertical: 20 },
});
