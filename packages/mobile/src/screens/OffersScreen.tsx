import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useUserStore } from '../store/useUserStore';
import { CreditFunnel, KeepPlan, loadCreditFunnel, loadCurrentPlanCode, loadPlans } from '../services/planService';
import { CommercialRules, getCommercialRules, getGrowthRewardStatus, GrowthRewardStatus } from '../services/growthAccessService';
import { DEFAULT_KEEP_BATTLE_RULES, KeepBattleArenaRules, loadKeepBattleArenaRules } from '../services/keepBattleExperienceService';
import { ProfileCertificationTier } from '../services/publicProfileStateService';
import ProfileCertificationBadge from '../components/ProfileCertificationBadge';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';

const DEFAULT_RULES: CommercialRules = {
  freeDiscoveryProfiles: 3,
  premiumSmartSortTrials: 3,
  premiumDailyDownloads: 40,
  shareDailyCap: 10,
  audienceProThreshold: 1000,
  shareTiers: [20, 50, 100],
  followerTiers: [25, 100, 250, 500, 1000],
  followerRewards: {
    tier1Discovery: 3,
    tier2Sort: 1,
    tier3Credits: 5,
    tier4Discovery: 5,
    tier4Sort: 1,
    tier5Credits: 20,
  },
  shareRewards: {
    tier1Discovery: 3,
    tier2Credits: 5,
    tier3Credits: 20,
    tier3Sort: 1,
  },
};

const PAID_PLAN_ORDER = ['PREMIUM', 'CREATOR_PRO', 'VENUE_PRO'] as const;

function money(plan: KeepPlan) {
  if (plan.monthlyAmount === 0) return 'Free';
  return `${plan.monthlyAmount.toFixed(2).replace('.', ',')} € / mois`;
}

function planLabel(code: string) {
  if (code === 'CREATOR_PRO') return 'Creator Pro';
  if (code === 'VENUE_PRO') return 'Venue Pro';
  if (code === 'PREMIUM') return 'Premium';
  return code === 'FREE' ? 'Free' : code.replace(/_/g, ' ');
}

function certificationTierForPlan(code: string): ProfileCertificationTier {
  if (code === 'VENUE_PRO') return 'VENUE_PRO';
  if (code === 'CREATOR_PRO') return 'CREATOR_PRO';
  if (code === 'PREMIUM') return 'PREMIUM';
  return 'FREE';
}

function compatiblePlanCodes(feature: string, focusPlan: string): string[] {
  if (feature === 'CREATE_EVENT' || feature === 'SMART_SORTING' || feature === 'CREATOR_KIND') return ['CREATOR_PRO', 'VENUE_PRO'];
  if (feature === 'SOCIAL_DISCOVERY' || feature === 'PUBLIC_PLAYLISTS') return ['PREMIUM', 'CREATOR_PRO', 'VENUE_PRO'];
  if (feature === 'VENUE_KIND') return ['VENUE_PRO'];
  const start = PAID_PLAN_ORDER.indexOf(focusPlan as (typeof PAID_PLAN_ORDER)[number]);
  return start >= 0 ? PAID_PLAN_ORDER.slice(start) : focusPlan ? [focusPlan] : [];
}

function requiredReason(feature: string, plan: string, rules: CommercialRules) {
  const eventFollowers = rules.followerTiers[3] || 500;
  if (feature === 'SOCIAL_DISCOVERY') return `Les ${rules.freeDiscoveryProfiles} premiers profils sont offerts en Free. Ensuite Premium, Creator Pro ou Venue Pro débloquent Découvertes sans limite.`;
  if (feature === 'SMART_SORTING') return `KEEP Vibes classe automatiquement ta musique par ambiances et styles. Il est inclus en illimité avec Creator Pro et Venue Pro. Premium garde ${rules.premiumSmartSortTrials} essais pour le découvrir.`;
  if (feature === 'PROFILE_SHARE') return 'Crée d’abord ton compte KEEP pour partager ton profil. Premium étend ensuite la visibilité de ton univers.';
  if (feature === 'PUBLIC_PLAYLISTS') return 'Les Vibes publiques sont disponibles à partir de Premium. Creator Pro et Venue Pro les incluent aussi.';
  if (feature === 'CREATOR_KIND') return 'Creator Pro et Venue Pro débloquent les profils DJ, Artiste, Créateur et Producteur.';
  if (feature === 'CREATE_EVENT') return `La création d’événements s’ouvre à partir de ${eventFollowers} abonnés. Creator Pro permet ensuite 1 soirée par mois ; Venue Pro passe les soirées en illimité.`;
  if (feature === 'VENUE_KIND') return 'Venue Pro débloque le profil Lieu / établissement et les outils professionnels.';
  return `${planLabel(plan)} est la formule minimale requise pour cette fonction. Les formules supérieures compatibles sont aussi affichées.`;
}

function benefitsFor(planCode: string, rules: CommercialRules, funnel: CreditFunnel): string[] {
  const eventFollowers = rules.followerTiers[3] || 500;
  if (planCode === 'FREE') return [
    'Écoute et reconnaissance illimitées : tes sessions continuent même sans crédit.',
    `${rules.freeDiscoveryProfiles} profils Découvertes offerts, puis Premium ou bonus gagnés avec ta communauté.`,
    `${funnel.guestSuccessLimit} KEEP avant inscription + ${funnel.signupBonusSuccesses} après création du compte.`,
    'Recharge tes Free en partageant KEEP, en faisant grandir tes abonnés et en remportant des KEEP Battles.',
  ];
  if (planCode === 'PREMIUM') return [
    'Écoute illimitée et profil musical étendu en illimité.',
    `Jusqu’à ${rules.premiumDailyDownloads} téléchargements par jour.`,
    'Découvertes de profils en illimité.',
    `${rules.premiumSmartSortTrials} essais de KEEP Vibes : KEEP classe automatiquement ta musique par ambiances et styles.`,
    'Profil reste « Utilisateur » : DJ / Artiste / Créateur se débloquent avec Creator Pro.',
  ];
  if (planCode === 'CREATOR_PRO') return [
    'Tout Premium + téléchargements illimités.',
    'KEEP Vibes illimité : classement automatique par styles/ambiances, albums intelligents et renommage libre.',
    'Choisis ton profil : DJ, Artiste, Créateur ou Producteur.',
    `À partir de ${eventFollowers} abonnés : 1 soirée créée par mois + notifications aux abonnés.`,
    'Analytics et fonctions créateur avancées.',
  ];
  if (planCode === 'VENUE_PRO') return [
    'Tout Creator Pro + téléchargements et KEEP Vibes illimités.',
    'Profil Lieu / établissement et outils professionnels.',
    `À partir de ${eventFollowers} abonnés : soirées et événements en illimité.`,
    'QR, communauté et analytics avancés.',
    `Les fonctions Audience Pro demandent aussi une vraie communauté : seuil actuel ${rules.audienceProThreshold} abonnés.`,
  ];
  return [];
}

export default function OffersScreen({ navigation, route }: any) {
  const user = useUserStore((s) => s.user);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const focusPlan = String(route?.params?.focusPlan || '').toUpperCase();
  const sourceFeature = String(route?.params?.sourceFeature || '').toUpperCase();
  const compatibleCodes = useMemo(() => compatiblePlanCodes(sourceFeature, focusPlan), [focusPlan, sourceFeature]);
  const isEventChoice = sourceFeature === 'CREATE_EVENT';
  const isUpgradeChoice = Boolean(focusPlan && compatibleCodes.length > 1);
  const [plans, setPlans] = useState<KeepPlan[]>([]);
  const [funnel, setFunnel] = useState<CreditFunnel>({ guestSuccessLimit: 3, signupBonusSuccesses: 20 });
  const [rules, setRules] = useState<CommercialRules>(DEFAULT_RULES);
  const [battleRules, setBattleRules] = useState<KeepBattleArenaRules>(DEFAULT_KEEP_BATTLE_RULES);
  const [growth, setGrowth] = useState<GrowthRewardStatus | null>(null);
  const [currentPlan, setCurrentPlan] = useState('FREE');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const canLoadGrowth = Boolean(user && !isLocalGuest && !isDemoMode);
        const [livePlans, liveFunnel, planCode, liveRules, liveBattleRules, liveGrowth] = await Promise.all([
          loadPlans(),
          loadCreditFunnel(),
          user ? loadCurrentPlanCode(user.id) : Promise.resolve('FREE'),
          getCommercialRules(),
          loadKeepBattleArenaRules(),
          canLoadGrowth ? getGrowthRewardStatus().catch(() => null) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setPlans(livePlans);
        setFunnel(liveFunnel);
        setCurrentPlan(planCode || 'FREE');
        setRules(liveRules);
        setBattleRules(liveBattleRules);
        setGrowth(liveGrowth);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Impossible de charger les offres.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, isLocalGuest, isDemoMode]);

  const freeTotal = useMemo(() => funnel.guestSuccessLimit + funnel.signupBonusSuccesses + (growth?.bonusFreeCredits ?? 0), [funnel, growth?.bonusFreeCredits]);
  const visiblePlans = useMemo(() => {
    if (!focusPlan) return plans;
    const allowed = new Set(compatibleCodes);
    return plans.filter((plan) => allowed.has(plan.code));
  }, [compatibleCodes, focusPlan, plans]);
  const [f1, f2, f3, f4, f5] = rules.followerTiers;
  const [s1, s2, s3] = rules.shareTiers;
  const fr = rules.followerRewards;
  const sr = rules.shareRewards;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Retour"><Text style={s.back}>‹</Text></TouchableOpacity>
        <View style={s.headerText}>
          <Text style={s.title}>Offre & crédits</Text>
          <Text style={s.subtitle}>{isEventChoice ? 'Soirées : choisis ta formule' : isUpgradeChoice ? `À partir de ${planLabel(focusPlan)}` : focusPlan ? `Formule requise : ${planLabel(focusPlan)}` : `Ton plan actuel : ${currentPlan}`}</Text>
        </View>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {focusPlan ? <View style={s.requiredIntro}>
          <Text style={s.requiredIntroEyebrow}>FONCTION VERROUILLÉE</Text>
          <View style={s.requiredPlanRow}>
            <Text style={s.requiredIntroTitle}>{isEventChoice ? 'Creator Pro ou Venue Pro' : isUpgradeChoice ? `À partir de ${planLabel(focusPlan)}` : planLabel(focusPlan)}</Text>
            <ProfileCertificationBadge tier={certificationTierForPlan(focusPlan)} />
          </View>
          <Text style={s.requiredIntroText}>{requiredReason(sourceFeature, focusPlan, rules)}</Text>
          {isEventChoice ? <View style={s.eventChoiceHint}><Text style={s.eventChoiceHintText}>À partir de {f4} abonnés · 9,99 € : 1 soirée / mois · 29,99 € : soirées illimitées</Text></View> : null}
          {!isEventChoice && isUpgradeChoice ? <View style={s.choiceHint}><Text style={s.choiceHintText}>Toutes les formules ci-dessous incluent cette fonction. Choisis selon les autres avantages dont tu as besoin.</Text></View> : null}
        </View> : <>
          <View style={s.promiseCard}>
            <Text style={s.promiseEyebrow}>KEEP</Text>
            <Text style={s.promiseTitle}>Écoute. Garde. Partage. Recharge.</Text>
            <Text style={s.promiseBody}>Les Free servent à GARDER les morceaux détectés avec Écouter. L’écoute, la reconnaissance et PASSER restent gratuits.</Text>
          </View>

          <View style={s.creditCard}>
            <View style={s.creditTop}><View><Text style={s.sectionTitle}>Tes Free obtenus</Text><Text style={s.creditBig}>{freeTotal}</Text></View><View style={s.freePill}><Text style={s.freePillText}>FREE</Text></View></View>
            <Text style={s.creditText}>{funnel.guestSuccessLimit} avant inscription + {funnel.signupBonusSuccesses} après création du compte{growth?.bonusFreeCredits ? ` + ${growth.bonusFreeCredits} gagnés avec ta communauté` : ''}.</Text>
            <Text style={s.creditRule}>Écouter / reconnaître / PASSER = 0 Free. GARDER un morceau détecté avec Écouter = 1 Free. Prendre un morceau sur le profil d’un autre membre = 0 Free.</Text>
            {growth ? <View style={s.growthGrid}>
              <View style={s.growthStat}><Text style={s.growthValue}>{growth.qualifiedShares}</Text><Text style={s.growthLabel}>partages qualifiés</Text></View>
              <View style={s.growthStat}><Text style={s.growthValue}>{growth.followers}</Text><Text style={s.growthLabel}>abonnés</Text></View>
              <View style={s.growthStat}><Text style={s.growthValue}>+{growth.bonusFreeCredits}</Text><Text style={s.growthLabel}>Free gagnés</Text></View>
            </View> : null}

            <View style={s.rechargeBox}>
              <Text style={s.rechargeEyebrow}>RECHARGER MES FREE</Text>
              <Text style={s.rechargeTitle}>Pas besoin de payer pour continuer.</Text>
              <Text style={s.rechargeIntro}>Fais vivre ton profil KEEP : certaines actions te redonnent réellement des Free.</Text>

              <View style={s.rechargeItem}>
                <Text style={s.rechargeIcon}>↗</Text>
                <View style={s.rechargeCopy}>
                  <Text style={s.rechargeItemTitle}>Partage KEEP</Text>
                  <Text style={s.rechargeItemText}>{s2} partages qualifiés → +{sr.tier2Credits} Free · {s3} partages → +{sr.tier3Credits} Free.</Text>
                  <Text style={s.rechargeHint}>Un partage doit être comptabilisé comme qualifié par KEEP. Limite actuelle : {rules.shareDailyCap} partages comptabilisés par jour.</Text>
                </View>
              </View>

              <View style={s.rechargeItem}>
                <Text style={s.rechargeIcon}>＋</Text>
                <View style={s.rechargeCopy}>
                  <Text style={s.rechargeItemTitle}>Fais grandir tes abonnés</Text>
                  <Text style={s.rechargeItemText}>{f3} abonnés → +{fr.tier3Credits} Free · {f5} abonnés → +{fr.tier5Credits} Free.</Text>
                  <Text style={s.rechargeHint}>Les autres paliers peuvent donner des Découvertes ou des essais Vibes, mais ils ne sont pas comptés comme des Free.</Text>
                </View>
              </View>

              <View style={s.rechargeItem}>
                <Text style={s.rechargeIcon}>⚡</Text>
                <View style={s.rechargeCopy}>
                  <Text style={s.rechargeItemTitle}>Gagne un KEEP Battle</Text>
                  <Text style={s.rechargeItemText}>Battle de 2 à {battleRules.maxPlayers} joueurs : le vainqueur gagne {battleRules.stakeFree} Free par adversaire battu.</Text>
                  <Text style={s.rechargeHint}>Il faut au moins {battleRules.minimumFreeRequired} Free pour entrer. À {battleRules.maxPlayers} joueurs, le gain peut atteindre +{battleRules.fullArenaNetPrize} Free. Si tu perds, -{battleRules.stakeFree} Free.</Text>
                </View>
              </View>

              <View style={s.startBonus}>
                <Text style={s.startBonusTitle}>BONUS DE DÉPART</Text>
                <Text style={s.startBonusText}>{funnel.guestSuccessLimit} Free avant inscription + {funnel.signupBonusSuccesses} après création du compte. C’est un bonus de démarrage, pas une recharge répétable.</Text>
              </View>
            </View>

            <View style={s.otherRewards}>
              <Text style={s.otherRewardsTitle}>AUTRES BONUS À GAGNER</Text>
              <Text style={s.otherRewardsLine}>{f1} abonnés → +{fr.tier1Discovery} profils Découvertes</Text>
              <Text style={s.otherRewardsLine}>{f2} abonnés → +{fr.tier2Sort} essai Vibes</Text>
              <Text style={s.otherRewardsLine}>{f4} abonnés → +{fr.tier4Discovery} Découvertes + {fr.tier4Sort} essai Vibes</Text>
              <Text style={s.otherRewardsLine}>{s1} partages → +{sr.tier1Discovery} Découvertes</Text>
              <Text style={s.otherRewardsLine}>{s3} partages → +{sr.tier3Sort} essai Vibes en plus des Free</Text>
              <Text style={s.vibesDefinition}>Vibes = KEEP range automatiquement tes morceaux par styles et ambiances pour créer des sélections musicales intelligentes.</Text>
            </View>
          </View>
        </>}

        {loading ? <ActivityIndicator color={colors.primaryLight} /> : error ? <Text style={s.error}>{error}</Text> : visiblePlans.map((plan) => {
          const active = plan.code === currentPlan;
          const focused = !!focusPlan && plan.code === focusPlan;
          const venueUnlimited = isEventChoice && plan.code === 'VENUE_PRO';
          return (
            <View key={plan.code} style={[s.planCard, active && s.planCardActive, focused && s.planCardFocused, venueUnlimited && s.planCardUnlimited]}>
              <View style={s.planTop}>
                <View style={s.planIdentity}>
                  <ProfileCertificationBadge tier={certificationTierForPlan(plan.code)} />
                  <View>
                    <Text style={s.planName}>{plan.name}</Text>
                    <Text style={s.planPrice}>{money(plan)}</Text>
                  </View>
                </View>
                {active ? <View style={s.currentBadge}><Text style={s.currentBadgeText}>ACTUEL</Text></View> : venueUnlimited ? <View style={s.unlimitedBadge}><Text style={s.unlimitedBadgeText}>ILLIMITÉ</Text></View> : focused ? <View style={s.requiredBadge}><Text style={s.requiredBadgeText}>MINIMUM</Text></View> : null}
              </View>
              {!!plan.description && <Text style={s.planDescription}>{plan.description}</Text>}
              <View style={s.benefitBox}>{benefitsFor(plan.code, rules, funnel).map((benefit) => <Text key={benefit} style={s.benefit}>• {benefit}</Text>)}</View>
              {plan.trialDays > 0 ? <Text style={s.trial}>Essai : {plan.trialDays} jours</Text> : null}
              {!active && plan.code !== 'FREE' ? (
                <TouchableOpacity style={[s.cta, venueUnlimited && s.ctaUnlimited]} onPress={() => navigation.setParams({ focusPlan: plan.code, sourceFeature: sourceFeature || 'PLAN_DETAILS' })} accessibilityRole="button">
                  <Text style={s.ctaText}>{venueUnlimited ? 'Voir Venue Pro · illimité' : `Voir ${planLabel(plan.code)}`}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}

        <View style={s.subscriptionCard}>
          <Text style={s.subscriptionTitle}>Règles simples</Text>
          <Text style={s.subscriptionText}>Free permet de découvrir KEEP et peut se recharger grâce au partage, aux abonnés et aux victoires Battle. Premium donne l’usage quotidien confortable. Creator Pro ajoute Vibes illimité et les outils créateur. Venue Pro ajoute les outils professionnels et les événements illimités selon les règles affichées.</Text>
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
  requiredPlanRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 5 },
  requiredIntroTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: '900', flexShrink: 1 },
  requiredIntroText: { color: '#F8F6FC', fontSize: 12, lineHeight: 18, marginTop: 7, fontWeight: '700' },
  eventChoiceHint: { marginTop: 10, borderRadius: 12, backgroundColor: '#17130B', borderWidth: 1, borderColor: '#D6AA36', paddingHorizontal: 10, paddingVertical: 8 },
  eventChoiceHintText: { color: '#FFF4C2', fontSize: 10, lineHeight: 15, fontWeight: '900', textAlign: 'center' },
  choiceHint: { marginTop: 10, borderRadius: 12, backgroundColor: '#151020', borderWidth: 1, borderColor: '#493369', paddingHorizontal: 10, paddingVertical: 8 },
  choiceHintText: { color: '#F8F6FC', fontSize: 10, lineHeight: 15, fontWeight: '800', textAlign: 'center' },
  promiseCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: '#151020', borderWidth: 1, borderColor: '#493369' },
  promiseEyebrow: { color: colors.primaryLight, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  promiseTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '900', lineHeight: 25, marginTop: 5 },
  promiseBody: { color: '#F8F6FC', fontSize: 12, lineHeight: 18, marginTop: 8, fontWeight: '700' },
  creditCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: '#1A1225', borderWidth: 1, borderColor: colors.primary },
  creditTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  sectionTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '900' },
  creditBig: { color: colors.primaryLight, fontSize: 28, fontWeight: '900', marginTop: 3 },
  freePill: { borderRadius: 999, borderWidth: 1, borderColor: colors.keep, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#13251C' },
  freePillText: { color: colors.keep, fontSize: 9, fontWeight: '900' },
  creditText: { color: '#F8F6FC', fontSize: 12, lineHeight: 18, marginTop: 4, fontWeight: '700' },
  creditRule: { color:'#FFFFFF', fontSize: 10, lineHeight: 15, marginTop: 7, fontWeight: '700' },
  growthGrid: { flexDirection: 'row', gap: 7, marginTop: 12 },
  growthStat: { flex: 1, minHeight: 58, borderRadius: 12, backgroundColor: '#151020', borderWidth: 1, borderColor: '#3D324A', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  growthValue: { color: colors.textPrimary, fontSize: 16, fontWeight: '900' },
  growthLabel: { color: '#E9E3F0', fontSize: 8, lineHeight: 11, textAlign: 'center', marginTop: 2, fontWeight: '700' },
  rechargeBox: { marginTop: 13, borderRadius: 16, backgroundColor: '#101D17', borderWidth: 1, borderColor: '#2C8A60', padding: 11 },
  rechargeEyebrow: { color: '#7CF2B9', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  rechargeTitle: { color: '#FFFFFF', fontSize: 16, lineHeight: 21, fontWeight: '900', marginTop: 3 },
  rechargeIntro: { color: '#FFFFFF', fontSize: 10, lineHeight: 15, fontWeight: '700', marginTop: 4 },
  rechargeItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: '#254936' },
  rechargeIcon: { width: 25, color: '#7CF2B9', fontSize: 19, fontWeight: '900', textAlign: 'center' },
  rechargeCopy: { flex: 1 },
  rechargeItemTitle: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  rechargeItemText: { color: '#FFFFFF', fontSize: 10, lineHeight: 15, fontWeight: '800', marginTop: 2 },
  rechargeHint: { color: '#FFFFFF', fontSize: 8, lineHeight: 12, fontWeight: '700', marginTop: 3 },
  startBonus: { marginTop: 10, borderRadius: 12, backgroundColor: '#17241D', paddingHorizontal: 9, paddingVertical: 8 },
  startBonusTitle: { color: '#7CF2B9', fontSize: 8, fontWeight: '900', letterSpacing: .7 },
  startBonusText: { color: '#FFFFFF', fontSize: 9, lineHeight: 13, fontWeight: '700', marginTop: 2 },
  otherRewards: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#493369', paddingTop: 10 },
  otherRewardsTitle: { color: colors.primaryLight, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  otherRewardsLine: { color: '#F8F6FC', fontSize: 10, lineHeight: 16, marginTop: 2, fontWeight: '700' },
  vibesDefinition: { color: '#FFFFFF', fontSize: 9, lineHeight: 14, marginTop: 7, fontWeight: '800' },
  planCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border },
  planCardActive: { borderColor: colors.primaryLight },
  planCardFocused: { borderColor: colors.primaryLight, borderWidth: 2 },
  planCardUnlimited: { borderColor: '#D6AA36', borderWidth: 2, backgroundColor: '#1A1710' },
  planTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  planIdentity: { flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 1 },
  planName: { color: colors.textPrimary, fontSize: 17, fontWeight: '900' },
  planPrice: { color: '#F8F6FC', fontSize: 13, fontWeight: '900', marginTop: 3 },
  currentBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.smartBadgeBg },
  currentBadgeText: { color: colors.smartBadgeText, fontSize: 9, fontWeight: '900' },
  requiredBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: '#3D2860', borderWidth: 1, borderColor: colors.primaryLight },
  requiredBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '900' },
  unlimitedBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: '#2B2410', borderWidth: 1, borderColor: '#D6AA36' },
  unlimitedBadgeText: { color: '#FFF4C2', fontSize: 9, fontWeight: '900' },
  planDescription: { color: '#F8F6FC', fontSize: 12, lineHeight: 17, marginTop: 9, fontWeight: '700' },
  benefitBox: { marginTop: 8, gap: 2 },
  benefit: { color: '#F8F6FC', fontSize: 11, lineHeight: 17, fontWeight: '700' },
  trial: { color: colors.keep, fontSize: 11, fontWeight: '900', marginTop: 8 },
  cta: { minHeight: 42, borderRadius: 21, marginTop: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  ctaUnlimited: { backgroundColor: '#8A6A12' },
  ctaText: { color: colors.white, fontSize: 12, fontWeight: '900' },
  subscriptionCard: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: '#151020', borderWidth: 1, borderColor: '#3D324A' },
  subscriptionTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '900' },
  subscriptionText: { color: '#F8F6FC', fontSize: 10, lineHeight: 16, marginTop: 5, fontWeight: '700' },
  allPlans: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  allPlansText: { color: colors.primaryLight, fontSize: 12, fontWeight: '900' },
  error: { color: colors.danger, textAlign: 'center', paddingVertical: 20 },
});