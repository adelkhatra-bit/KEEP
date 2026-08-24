import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, ActivityIndicator, ScrollView as HScroll } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';
import { fetchPlans, fetchMySubscription, formatMonthlyPrice, RemotePlan } from '../services/billingApi';
import { AppAlert as Alert } from '../utils/AppAlert';
import CreditCounter from '../components/CreditCounter';

/**
 * "Choisir mon offre" (cf. demande explicite du 24/08/2026 -- "transforme
 * les badges décoratifs en vrai système d'abonnement"). Données RÉELLES
 * (packages/backend/src/routes/billing.ts -> plans/plan_prices/
 * plan_entitlements/usage_limits réels) -- aucun prix/avantage codé en dur
 * ici. Paiement pas encore branché (BillingProvider, voir
 * docs/KEEP_DECISIONS.md) -- le CTA le dit honnêtement plutôt que de faire
 * semblant ("Paiement bientôt disponible"), jamais un faux "Payé !".
 */
const RANK: Record<RemotePlan['code'], number> = { FREE: 0, PREMIUM: 1, CREATOR_PRO: 2, VENUE_PRO: 3 };

function usageLimitLabel(t: (k: string, o?: any) => string, key: string, value: number | null): string | null {
  if (value === null) return null; // illimité -- pas listé comme "avantage" séparé, déjà impliqué par l'absence de limite.
  const labels: Record<string, string> = {
    keeps_per_month: t('offers.limitKeeps', { count: value }),
    follows_max: t('offers.limitFollows', { count: value }),
    compares_per_month: t('offers.limitCompares', { count: value }),
    providers_max: t('offers.limitProviders', { count: value }),
    events_max: t('offers.limitEvents', { count: value }),
  };
  return labels[key] ?? null;
}

export default function OffersScreen({ navigation }: any) {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<RemotePlan[] | null>(null);
  const [currentPlanCode, setCurrentPlanCode] = useState<RemotePlan['code']>('FREE');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RemotePlan | null>(null);

  useEffect(() => {
    (async () => {
      const [remotePlans, sub] = await Promise.all([fetchPlans(), fetchMySubscription()]);
      setPlans(remotePlans);
      if (sub?.plans?.code) setCurrentPlanCode(sub.plans.code);
      setLoading(false);
    })();
  }, []);

  const handleChoose = (plan: RemotePlan) => {
    Alert.alert(
      t('offers.sandboxTitle'),
      t('offers.sandboxBody'),
      [{ text: 'OK' }]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}><ActivityIndicator color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  if (!plans || plans.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}><Text style={styles.offlineText}>{t('offers.offline')}</Text></View>
      </SafeAreaView>
    );
  }

  const sorted = [...plans].sort((a, b) => RANK[a.code] - RANK[b.code]);
  const featureCodes = Array.from(new Set(sorted.flatMap((p) => p.plan_entitlements.filter((e) => e.is_enabled).map((e) => e.features.code))))
    .sort((a, b) => {
      const rankOf = (code: string) => Math.min(...sorted.filter((p) => p.plan_entitlements.some((e) => e.features.code === code && e.is_enabled)).map((p) => RANK[p.code]));
      return rankOf(a) - rankOf(b);
    });
  const featureNameByCode: Record<string, string> = {};
  for (const p of sorted) for (const e of p.plan_entitlements) featureNameByCode[e.features.code] = e.features.name;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => (selected ? setSelected(null) : navigation.goBack())} hitSlop={12}>
          <Text style={styles.backText}>← {t('common.back', 'Retour')}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{selected ? selected.name : t('offers.title')}</Text>
        <View style={{ width: 50 }} />
      </View>

      {selected ? (
        <ScrollView contentContainerStyle={styles.detailScroll}>
          <Text style={styles.detailPrice}>{formatMonthlyPrice(selected)}</Text>
          <Text style={styles.detailTagline}>{selected.description}</Text>

          {selected.usage_limits
            .map((l) => usageLimitLabel(t, l.limit_key, l.limit_value))
            .filter((x): x is string => !!x)
            .map((label) => (
              <View key={label} style={styles.checkRow}>
                <Text style={styles.checkMark}>✓</Text>
                <Text style={styles.checkText}>{label}</Text>
              </View>
            ))}
          {selected.plan_entitlements
            .filter((e) => e.is_enabled)
            .map((e) => (
              <View key={e.features.code} style={styles.checkRow}>
                <Text style={styles.checkMark}>✓</Text>
                <Text style={styles.checkText}>{e.features.name}</Text>
              </View>
            ))}

          {currentPlanCode === selected.code ? (
            <View style={[styles.ctaBtn, styles.ctaBtnCurrent]}>
              <Text style={styles.ctaTextCurrent}>{t('offers.currentPlan')}</Text>
            </View>
          ) : selected.code === 'FREE' ? null : (
            <TouchableOpacity style={styles.ctaBtn} onPress={() => handleChoose(selected)}>
              <Text style={styles.ctaText}>{t('offers.choosePlan', { plan: selected.name, price: formatMonthlyPrice(selected) })}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.listScroll}>
          {/* BUG RÉEL trouvé le 24/08/2026 (Adel, test réel : "le développeur
              mélange Free avec tes offres payantes... je supprimerais le gros
              bloc Free — 0€ — Plan actuel, ça donne l'impression que Free est
              un abonnement permanent comparable aux 3 autres") -- FREE n'est
              plus une carte parmi les 4, juste un statut simple en tête,
              suivi du même compteur de téléchargements que le reste de
              l'app (jamais une deuxième logique de comptage inventée ici). */}
          {currentPlanCode === 'FREE' && (
            <View style={styles.currentAccessBox}>
              <Text style={styles.currentAccessLabel}>{t('offers.currentAccessFree')}</Text>
              <CreditCounter />
            </View>
          )}

          <Text style={styles.chooseTitle}>{t('offers.chooseTitle')}</Text>

          {sorted
            .filter((plan) => plan.code !== 'FREE')
            .map((plan) => (
              <TouchableOpacity
                key={plan.code}
                style={[styles.card, plan.code === 'PREMIUM' && styles.cardPopular, currentPlanCode === plan.code && styles.cardCurrent]}
                onPress={() => setSelected(plan)}
              >
                {plan.code === 'PREMIUM' && <Text style={styles.popularTag}>{t('offers.popular')}</Text>}
                <View style={styles.cardRow}>
                  <Text style={styles.cardName}>{plan.name}</Text>
                  <Text style={styles.cardPrice}>{formatMonthlyPrice(plan)}</Text>
                </View>
                {!!plan.description && <Text style={styles.cardTagline}>{plan.description}</Text>}
                {currentPlanCode === plan.code && <Text style={styles.cardCurrentLabel}>{t('offers.currentPlan')}</Text>}
              </TouchableOpacity>
            ))}

          <Text style={styles.compareTitle}>{t('offers.compareTitle')}</Text>
          <HScroll horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={styles.compareRow}>
                <Text style={[styles.compareCell, styles.compareHeadCell]} />
                {sorted.map((p) => (
                  <Text key={p.code} style={[styles.compareCell, styles.compareHeadCell, styles.compareHeadText]}>{p.name}</Text>
                ))}
              </View>
              {featureCodes.map((code) => (
                <View key={code} style={styles.compareRow}>
                  <Text style={[styles.compareCell, styles.compareLabelCell]}>{featureNameByCode[code]}</Text>
                  {sorted.map((p) => {
                    const has = p.plan_entitlements.some((e) => e.features.code === code && e.is_enabled);
                    return <Text key={p.code} style={styles.compareCell}>{has ? '✓' : '—'}</Text>;
                  })}
                </View>
              ))}
            </View>
          </HScroll>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  offlineText: { color: colors.textSecondary, fontSize: 14 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backText: { color: colors.primaryLight, fontWeight: '600', fontSize: 13 },
  title: { ...typography.h2, color: colors.textPrimary, fontSize: 17 },

  listScroll: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  currentAccessBox: {
    backgroundColor: colors.backgroundCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, alignItems: 'center', marginBottom: spacing.lg,
  },
  currentAccessLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: spacing.xs },
  chooseTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.sm },
  cardTagline: { color: colors.textSecondary, fontSize: 12, marginTop: spacing.xs },
  card: {
    backgroundColor: colors.backgroundCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  cardPopular: { borderColor: colors.primary },
  cardCurrent: { borderColor: colors.keep, borderWidth: 2 },
  popularTag: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: spacing.xs },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  cardPrice: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  cardCurrentLabel: { color: colors.keep, fontSize: 11, fontWeight: '700', marginTop: spacing.xs },

  compareTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '700', marginTop: spacing.lg, marginBottom: spacing.sm },
  compareRow: { flexDirection: 'row' },
  compareCell: { width: 90, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs, color: colors.textSecondary, fontSize: 12, textAlign: 'center' },
  compareLabelCell: { width: 150, textAlign: 'left', color: colors.textPrimary, fontWeight: '600' },
  compareHeadCell: { width: 90 },
  compareHeadText: { color: colors.textPrimary, fontWeight: '700' },

  detailScroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  detailPrice: { color: colors.textPrimary, fontSize: 28, fontWeight: '800' },
  detailTagline: { color: colors.textSecondary, fontSize: 14, marginBottom: spacing.md },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  checkMark: { color: colors.keep, fontWeight: '800' },
  checkText: { color: colors.textPrimary, fontSize: 14, flex: 1 },
  ctaBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.lg },
  ctaBtnCurrent: { backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.keep },
  ctaText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  ctaTextCurrent: { color: colors.keep, fontWeight: '700', fontSize: 15 },
});
