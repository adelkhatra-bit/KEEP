import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { useUserStore } from '../store/useUserStore';
import { CREDIT_FUNNEL_DEFAULTS, CreditFunnel, KeepPlan, loadCreditFunnel, loadCurrentPlanCode, loadPlans } from '../services/planService';
import { iapAvailable, IAP_PRODUCT_IDS, purchasePlan, restorePurchases } from '../services/iapService';
import { CommercialRules, getCommercialRules, getGrowthRewardStatus, GrowthRewardStatus } from '../services/growthAccessService';
import { DEFAULT_KEEP_BATTLE_RULES, KeepBattleArenaRules, loadKeepBattleArenaRules } from '../services/keepBattleExperienceService';
import { loadMyKeepBattleCreditStatus } from '../services/keepBattleService';
import { FreeCreditBreakdown, getDownloadCreditStatus, loadFreeCreditBreakdown } from '../services/creditService';
import { ProfileCertificationTier } from '../services/publicProfileStateService';
import ProfileCertificationBadge from '../components/ProfileCertificationBadge';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';

const DEFAULT_RULES: CommercialRules = {
  freeDiscoveryProfiles: 3,
  premiumSmartSortTrials: 3,
  premiumDailyDownloads: 40,
  creatorDailyDownloads: null,
  venueDailyDownloads: null,
  creatorEventsPerMonth: 1,
  venueEventsPerMonth: null,
  freeCostPerKeep: 3,
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

// Adel (04/09/2026) : "où y a marqué illimité, je puisse le modifier
// illimité ou limité ... si tu l'as mis dans le dur ça va être compliqué"
// -- ces phrases écrivaient "illimité" en dur pour Creator Pro / Venue Pro,
// indépendamment de ce que Super Admin > Limites par formule configure
// réellement (downloads_per_day / events_per_month, déjà éditables pour
// TOUTES les formules). null = toujours illimité aujourd'hui (comportement
// inchangé par défaut) ; dès qu'un admin tape un chiffre, le texte des
// offres l'affiche automatiquement au lieu de continuer à mentir.
function eventsPerMonthClause(limit: number | null): string {
  return limit == null ? 'en illimité' : `${limit} par mois`;
}

function requiredReason(feature: string, plan: string, rules: CommercialRules) {
  const eventFollowers = rules.followerTiers[3] || 500;
  if (feature === 'SOCIAL_DISCOVERY') return `Les ${rules.freeDiscoveryProfiles} premiers profils sont offerts en Free. Ensuite Premium, Creator Pro ou Venue Pro débloquent Découvertes sans limite.`;
  if (feature === 'SMART_SORTING') return `Loki Vibes classe automatiquement ta musique par ambiances et styles. Il est inclus en illimité avec Creator Pro et Venue Pro. Premium garde ${rules.premiumSmartSortTrials} essais pour le découvrir.`;
  if (feature === 'PROFILE_SHARE') return 'Crée d’abord ton compte Loki pour partager ton profil. Premium étend ensuite la visibilité de ton univers.';
  if (feature === 'PUBLIC_PLAYLISTS') return 'Les Vibes publiques sont disponibles à partir de Premium. Creator Pro et Venue Pro les incluent aussi.';
  if (feature === 'CREATOR_KIND') return 'Creator Pro et Venue Pro débloquent les profils DJ, Artiste, Créateur et Producteur.';
  if (feature === 'CREATE_EVENT') return `La création d’événements s’ouvre à partir de ${eventFollowers} abonnés. Creator Pro : soirées ${eventsPerMonthClause(rules.creatorEventsPerMonth)} ; Venue Pro : soirées ${eventsPerMonthClause(rules.venueEventsPerMonth)}.`;
  if (feature === 'VENUE_KIND') return 'Venue Pro débloque le profil Lieu / établissement et les outils professionnels.';
  return `${planLabel(plan)} est la formule minimale requise pour cette fonction. Les formules supérieures compatibles sont aussi affichées.`;
}

function benefitsFor(planCode: string, rules: CommercialRules, funnel: CreditFunnel, monthlyFreeBonus: number): string[] {
  const eventFollowers = rules.followerTiers[3] || 500;
  // Adel (04/09/2026) : "il faut vraiment qu'ils sachent combien de Free il
  // a par mois ... sans compter avec les matchs" -- monthlyFreeBonus vient
  // directement de plan_prices (réglé dans Abonnements, Prix & Quotas au
  // même endroit que le prix lui-même), séparé de ce que le Battle fait
  // gagner/perdre en plus.
  if (planCode === 'FREE') return [
    `+${monthlyFreeBonus} Free offerts chaque mois (hors Battle).`,
    `Écouter, reconnaître et PASSER : 0 Free. GARDER depuis Écouter : ${rules.freeCostPerKeep} Free.`,
    `${rules.freeDiscoveryProfiles} profils Découvertes offerts au démarrage.`,
    `${funnel.guestSuccessLimit} Free avant inscription + ${funnel.signupBonusSuccesses} après création du compte.`,
  ];
  if (planCode === 'PREMIUM') return [
    `+${monthlyFreeBonus} Free offerts chaque mois (hors Battle).`,
    `Jusqu’à ${rules.premiumDailyDownloads} téléchargements par jour.`,
    'Découvertes de profils en illimité.',
    `${rules.premiumSmartSortTrials} essais de Loki Vibes.`,
  ];
  if (planCode === 'CREATOR_PRO') return [
    `+${monthlyFreeBonus} Free offerts chaque mois (hors Battle).`,
    rules.creatorDailyDownloads == null ? 'Téléchargements et Loki Vibes illimités.' : `Jusqu’à ${rules.creatorDailyDownloads} téléchargements par jour, Loki Vibes illimité.`,
    'Profils DJ, Artiste, Créateur ou Producteur.',
    `À partir de ${eventFollowers} abonnés : soirées ${eventsPerMonthClause(rules.creatorEventsPerMonth)} et notifications aux abonnés.`,
    'Analytics et outils créateur avancés.',
  ];
  if (planCode === 'VENUE_PRO') return [
    `+${monthlyFreeBonus} Free offerts chaque mois (hors Battle).`,
    'Profil Lieu / établissement et outils professionnels.',
    `À partir de ${eventFollowers} abonnés : soirées et événements ${eventsPerMonthClause(rules.venueEventsPerMonth)}.`,
    'Invitations aux événements envoyées à tes abonnés ET à tous ceux qui ont déjà gardé un de tes morceaux -- sans publicité sur Loki, personne ne peut désactiver la notification.',
    'QR, communauté et analytics avancés.',
    `Fonctions Audience Pro à partir de ${rules.audienceProThreshold} abonnés.`,
  ];
  return [];
}

function planSummary(planCode: string): string {
  if (planCode === 'PREMIUM') return 'Pour profiter de Loki au quotidien avec davantage de liberté.';
  if (planCode === 'CREATOR_PRO') return 'Pour les DJs, artistes et créateurs qui développent leur communauté.';
  if (planCode === 'VENUE_PRO') return 'Pour les lieux et établissements qui organisent et animent leur audience.';
  return 'Les fonctions essentielles de Loki pour commencer.';
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
  const [funnel, setFunnel] = useState<CreditFunnel>(CREDIT_FUNNEL_DEFAULTS);
  const [rules, setRules] = useState<CommercialRules>(DEFAULT_RULES);
  const [battleRules, setBattleRules] = useState<KeepBattleArenaRules>(DEFAULT_KEEP_BATTLE_RULES);
  const [growth, setGrowth] = useState<GrowthRewardStatus | null>(null);
  // Adel (04/09/2026) : "l'utilisateur il a besoin de savoir comment elle a
  // gagné des Free ... il faut qu'il comprenne exactement comment ils ont
  // gagné" -- détail réel du solde (composantes nommées + derniers Battle),
  // pas seulement le texte de règles générique déjà affiché plus haut.
  const [breakdown, setBreakdown] = useState<FreeCreditBreakdown | null>(null);
  const [currentPlan, setCurrentPlan] = useState('FREE');
  const [freeBalance, setFreeBalance] = useState<number | null>(null);
  const [freeUnlimited, setFreeUnlimited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [freeExpanded, setFreeExpanded] = useState(false);
  const [battleExpanded, setBattleExpanded] = useState(false);
  const [discoveryExpanded, setDiscoveryExpanded] = useState(false);
  const [rulesExpanded, setRulesExpanded] = useState(false);
  const [expandedPlanCode, setExpandedPlanCode] = useState<string | null>(null);
  // Adel (04/09/2026) : "il faut qu'on branche le paiement" -- premier vrai
  // achat StoreKit de bout en bout (KeepIAP -> keep-iap-verify -> activation
  // réelle du plan), plus jamais un CTA qui ne fait que naviguer.
  const [purchasingPlan, setPurchasingPlan] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const handleRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const { restored } = await restorePurchases();
      if (restored > 0 && user) {
        const planCode = await loadCurrentPlanCode(user.id).catch(() => null);
        if (planCode) setCurrentPlan(planCode);
        Alert.alert('Achats restaurés', `${restored} abonnement${restored > 1 ? 's' : ''} retrouvé${restored > 1 ? 's' : ''} et réactivé${restored > 1 ? 's' : ''}.`);
      } else {
        Alert.alert('Restauration', 'Aucun achat à restaurer sur ce compte Apple.');
      }
    } finally {
      setRestoring(false);
    }
  };

  const handlePurchase = async (planCode: string) => {
    if (purchasingPlan) return;
    setPurchasingPlan(planCode);
    try {
      const result = await purchasePlan(planCode);
      if (!result.ok) {
        if (result.reason !== 'CANCELLED') {
          Alert.alert('Achat', 'Impossible de finaliser cet achat pour le moment. Réessaie dans un instant.');
        }
        return;
      }
      setCurrentPlan(result.planCode);
      Alert.alert('Merci !', `Ton abonnement ${planLabel(result.planCode)} est actif.`);
    } finally {
      setPurchasingPlan(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const canLoadGrowth = Boolean(user && !isLocalGuest && !isDemoMode);
        const [livePlans, liveFunnel, planCode, liveRules, liveBattleRules, liveGrowth, liveFreeStatus, liveBreakdown] = await Promise.all([
          loadPlans(),
          loadCreditFunnel(),
          user ? loadCurrentPlanCode(user.id) : Promise.resolve('FREE'),
          getCommercialRules(),
          loadKeepBattleArenaRules(),
          canLoadGrowth ? getGrowthRewardStatus().catch(() => null) : Promise.resolve(null),
          canLoadGrowth
            ? loadMyKeepBattleCreditStatus().catch(() => null)
            : getDownloadCreditStatus().catch(() => null),
          canLoadGrowth ? loadFreeCreditBreakdown().catch(() => null) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setPlans(livePlans);
        setFunnel(liveFunnel);
        setCurrentPlan(planCode || 'FREE');
        setRules(liveRules);
        setBattleRules(liveBattleRules);
        setGrowth(liveGrowth);
        setBreakdown(liveBreakdown);
        if (liveFreeStatus && 'remainingFree' in liveFreeStatus) {
          setFreeBalance(Number(liveFreeStatus.remainingFree ?? 0));
          setFreeUnlimited(false);
        } else if (liveFreeStatus) {
          setFreeBalance(liveFreeStatus.remaining == null ? null : Number(liveFreeStatus.remaining));
          setFreeUnlimited(Boolean(liveFreeStatus.unlimited));
        } else {
          setFreeBalance(null);
          setFreeUnlimited(false);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Impossible de charger les offres.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, isLocalGuest, isDemoMode]);

  const freeBalanceLabel = freeUnlimited ? '∞' : freeBalance == null ? '—' : String(Math.max(0, freeBalance));
  const visiblePlans = useMemo(() => {
    // La formule Free possède son propre bloc compact au-dessus. Les cartes
    // ci-dessous restent donc réservées aux offres Premium / Pro.
    const paidPlans = plans.filter((plan) => plan.code !== 'FREE');
    if (!focusPlan || focusPlan === 'FREE') return paidPlans;
    const allowed = new Set(compatibleCodes);
    return paidPlans.filter((plan) => allowed.has(plan.code));
  }, [compatibleCodes, focusPlan, plans]);
  const [f1, f2, f3, f4, f5] = rules.followerTiers;
  const [s1, s2, s3] = rules.shareTiers;
  const fr = rules.followerRewards;
  const sr = rules.shareRewards;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'))} accessibilityLabel="Retour"><Text style={s.back}>‹</Text></TouchableOpacity>
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
          {isEventChoice ? <View style={s.eventChoiceHint}><Text style={s.eventChoiceHintText}>À partir de {f4} abonnés · 9,99 € : soirées {eventsPerMonthClause(rules.creatorEventsPerMonth)} · 29,99 € : soirées {eventsPerMonthClause(rules.venueEventsPerMonth)}</Text></View> : null}
          {!isEventChoice && isUpgradeChoice ? <View style={s.choiceHint}><Text style={s.choiceHintText}>Toutes les formules ci-dessous incluent cette fonction. Choisis selon les autres avantages dont tu as besoin.</Text></View> : null}
        </View> : <>
          <View style={s.promiseCard}>
            <Text style={s.promiseEyebrow}>Loki</Text>
            <Text style={s.promiseTitle}>Écoute. Garde. Partage. Recharge.</Text>
            <Text style={s.promiseCommunity}>Fais grandir ta communauté musicale.</Text>
          </View>

          <View style={s.discoveryCard}>
            <Text style={s.discoveryEyebrow}>DÉCOUVERTE Loki</Text>
            <Text style={s.discoveryTitle}>Tes découvertes peuvent faire grandir ton profil.</Text>
            <Text style={s.discoveryBody}>Quand tu reconnais un morceau avec Écouter puis que tu le gardes, Loki associe cette découverte à ton profil. Si d’autres membres récupèrent ensuite ce titre depuis la communauté, ils ne dépensent aucun Free et ton pseudo reste affiché comme découvreur, avec un accès direct à ton profil.</Text>
            <TouchableOpacity
              style={s.disclosureButton}
              onPress={() => setDiscoveryExpanded((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel="En savoir plus sur l’attribution des découvertes"
              accessibilityState={{ expanded: discoveryExpanded }}
            >
              <Text style={s.disclosureText}>{discoveryExpanded ? 'Réduire' : 'En savoir plus'}</Text>
              <Text style={s.disclosureChevron}>{discoveryExpanded ? '⌃' : '⌄'}</Text>
            </TouchableOpacity>
            {discoveryExpanded ? <View style={s.discoveryDetails}>
              <View style={s.discoveryStep}><Text style={s.discoveryStepNumber}>1</Text><Text style={s.discoveryStepText}>Tu identifies un titre avec Écouter et tu le gardes : ton profil devient le découvreur Loki de cette occurrence.</Text></View>
              <View style={s.discoveryStep}><Text style={s.discoveryStepNumber}>2</Text><Text style={s.discoveryStepText}>Un membre récupère ce titre depuis ton profil : 0 Free débité pour lui, et le morceau est identifié comme un morceau issu de la communauté.</Text></View>
              <View style={s.discoveryStep}><Text style={s.discoveryStepNumber}>3</Text><Text style={s.discoveryStepText}>Le titre peut circuler de profil en profil : s’il est repris 20 fois depuis cette chaîne, ton pseudo reste visible et cliquable sur les 20 copies. Chaque reprise peut donc amener de nouveaux visiteurs et abonnés vers ton profil.</Text></View>
              <View style={s.discoveryStep}><Text style={s.discoveryStepNumber}>4</Text><Text style={s.discoveryStepText}>Si un membre découvre lui-même le titre avec Écouter et l’enregistre directement, sa propre découverte devient la référence des partages issus de cette écoute.</Text></View>
            </View> : null}
          </View>

          <View style={s.creditCard}>
            <View style={s.creditTop}>
              <View><Text style={s.sectionTitle}>Tes Free disponibles</Text><Text style={s.creditBig}>{freeBalanceLabel}</Text></View>
              <View style={s.freePill}><Text style={s.freePillText}>FREE</Text></View>
            </View>

            <TouchableOpacity
              style={s.disclosureButton}
              onPress={() => setFreeExpanded((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel="En savoir plus sur les Free"
              accessibilityState={{ expanded: freeExpanded }}
            >
              <Text style={s.disclosureText}>{freeExpanded ? 'Réduire' : 'En savoir plus'}</Text>
              <Text style={s.disclosureChevron}>{freeExpanded ? '⌃' : '⌄'}</Text>
            </TouchableOpacity>

            {freeExpanded ? <>
              <Text style={s.creditText}>Ce nombre est ton solde réellement disponible. Au démarrage : {funnel.guestSuccessLimit} Free avant inscription + {funnel.signupBonusSuccesses} après création du compte. Les Free utilisés sont déduits ; les récompenses communauté et Battle s’ajoutent automatiquement.</Text>
              <Text style={s.creditRule}>Écouter / reconnaître / PASSER = 0 Free. GARDER un morceau détecté avec Écouter = 1 Free. Prendre un morceau sur le profil d’un autre membre = 0 Free.</Text>
              {growth ? <View style={s.growthGrid}>
                <View style={s.growthStat}><Text style={s.growthValue}>{growth.qualifiedShares}</Text><Text style={s.growthLabel}>partages qualifiés</Text></View>
                <View style={s.growthStat}><Text style={s.growthValue}>{growth.followers}</Text><Text style={s.growthLabel}>abonnés</Text></View>
                <View style={s.growthStat}><Text style={s.growthValue}>+{growth.bonusFreeCredits}</Text><Text style={s.growthLabel}>Free gagnés</Text></View>
              </View> : null}

              {breakdown ? <View style={s.breakdownBox}>
                <Text style={s.breakdownTitle}>D’OÙ VIENT TON SOLDE ({breakdown.remaining} Free)</Text>
                <View style={s.breakdownRow}><Text style={s.breakdownLabel}>Invité (avant inscription)</Text><Text style={s.breakdownValue}>+{breakdown.guestLimit}</Text></View>
                <View style={s.breakdownRow}><Text style={s.breakdownLabel}>Bonus d’inscription</Text><Text style={s.breakdownValue}>+{breakdown.signupBonus}</Text></View>
                {breakdown.followerBonus > 0 ? <View style={s.breakdownRow}><Text style={s.breakdownLabel}>{breakdown.followerCount} abonnés (palier {breakdown.followerCount >= breakdown.followerTier5 ? breakdown.followerTier5 : breakdown.followerTier3})</Text><Text style={s.breakdownValue}>+{breakdown.followerBonus}</Text></View> : null}
                {breakdown.referralBonus > 0 ? <View style={s.breakdownRow}><Text style={s.breakdownLabel}>{breakdown.referralCount} filleul(s) parrainé(s)</Text><Text style={s.breakdownValue}>+{breakdown.referralBonus}</Text></View> : null}
                {breakdown.monthlyBonus > 0 ? <View style={s.breakdownRow}><Text style={s.breakdownLabel}>Bonus mensuel</Text><Text style={s.breakdownValue}>+{breakdown.monthlyBonus}</Text></View> : null}
                {breakdown.adminGrant !== 0 ? <View style={s.breakdownRow}><Text style={s.breakdownLabel}>Crédit accordé par l’équipe</Text><Text style={s.breakdownValue}>{breakdown.adminGrant > 0 ? '+' : ''}{breakdown.adminGrant}</Text></View> : null}
                {breakdown.battleAdjustment !== 0 ? <View style={s.breakdownRow}><Text style={s.breakdownLabel}>Résultat net des Battle</Text><Text style={s.breakdownValue}>{breakdown.battleAdjustment > 0 ? '+' : ''}{breakdown.battleAdjustment}</Text></View> : null}
                <View style={s.breakdownRow}><Text style={s.breakdownLabel}>Free déjà utilisés (GARDER)</Text><Text style={s.breakdownValue}>−{breakdown.used}</Text></View>
                {breakdown.lockedArena > 0 ? <View style={s.breakdownRow}><Text style={s.breakdownLabel}>Mise verrouillée (Battle en cours)</Text><Text style={s.breakdownValue}>−{breakdown.lockedArena}</Text></View> : null}
                {breakdown.recentBattles.length ? <>
                  <Text style={s.breakdownSubtitle}>DERNIERS BATTLE</Text>
                  {breakdown.recentBattles.slice(0, 6).map((event, i) => (
                    <View key={i} style={s.breakdownRow}>
                      <Text style={s.breakdownLabel}>{event.result === 'WIN' ? '🏆 Victoire' : '❌ Défaite'}{event.themeCode ? ` · ${event.themeCode}` : ''} · {new Date(event.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</Text>
                      <Text style={[s.breakdownValue, event.amount < 0 && s.breakdownValueNegative]}>{event.amount > 0 ? '+' : ''}{event.amount}</Text>
                    </View>
                  ))}
                </> : null}
              </View> : null}

              <View style={s.rechargeBox}>
                <Text style={s.rechargeEyebrow}>RECHARGER MES FREE</Text>
                <Text style={s.rechargeTitle}>Pas besoin de payer pour continuer.</Text>
                <Text style={s.rechargeIntro}>Partage Loki et fais grandir ta communauté : certaines actions te redonnent réellement des Free.</Text>

                <View style={s.rechargeItem}>
                  <Text style={s.rechargeIcon}>↗</Text>
                  <View style={s.rechargeCopy}>
                    <Text style={s.rechargeItemTitle}>Partage Loki</Text>
                    <Text style={s.rechargeItemText}>{s2} partages qualifiés → +{sr.tier2Credits} Free · {s3} partages → +{sr.tier3Credits} Free.</Text>
                    <Text style={s.rechargeHint}>Limite actuelle : {rules.shareDailyCap} partages comptabilisés par jour.</Text>
                  </View>
                </View>

                <View style={s.rechargeItem}>
                  <Text style={s.rechargeIcon}>＋</Text>
                  <View style={s.rechargeCopy}>
                    <Text style={s.rechargeItemTitle}>Fais grandir tes abonnés</Text>
                    <Text style={s.rechargeItemText}>{f3} abonnés → +{fr.tier3Credits} Free · {f5} abonnés → +{fr.tier5Credits} Free.</Text>
                    <Text style={s.rechargeHint}>Les autres paliers peuvent aussi donner des Découvertes ou des essais Vibes.</Text>
                  </View>
                </View>

                <View style={s.startBonus}>
                  <Text style={s.startBonusTitle}>BONUS DE DÉPART</Text>
                  <Text style={s.startBonusText}>{funnel.guestSuccessLimit} Free avant inscription + {funnel.signupBonusSuccesses} après création du compte. C’est un bonus de démarrage, pas une recharge répétable.</Text>
                </View>
              </View>

              <View style={s.otherRewards}>
                <Text style={s.otherRewardsTitle}>BONUS GRATUITS EN PLUS DE TON OFFRE</Text>
                <Text style={s.otherRewardsIntro}>Tu les gagnes en faisant vivre ta communauté musicale et en partageant Loki.</Text>
                <Text style={s.otherRewardsLine}>{f1} abonnés → +{fr.tier1Discovery} profils Découvertes</Text>
                <Text style={s.otherRewardsLine}>{f2} abonnés → +{fr.tier2Sort} essai Vibes</Text>
                <Text style={s.otherRewardsLine}>{f4} abonnés → +{fr.tier4Discovery} Découvertes + {fr.tier4Sort} essai Vibes</Text>
                <Text style={s.otherRewardsLine}>{s1} partages → +{sr.tier1Discovery} Découvertes</Text>
                <Text style={s.otherRewardsLine}>{s3} partages → +{sr.tier3Sort} essai Vibes en plus des Free</Text>
                <Text style={s.vibesDefinition}>Vibes = Loki range automatiquement tes morceaux par styles et ambiances pour créer des sélections musicales intelligentes.</Text>
              </View>
            </> : null}
          </View>

          <View style={s.battleCard}>
            <View style={s.battleHeader}>
              <View style={s.battleHeaderCopy}>
                <Text style={s.battleEyebrow}>Loki BATTLES</Text>
                <Text style={s.battleTitle}>⚡ Affronte. Gagne des Free.</Text>
              </View>
            </View>
            <TouchableOpacity
              style={s.disclosureButton}
              onPress={() => setBattleExpanded((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel="En savoir plus sur les Loki Battles"
              accessibilityState={{ expanded: battleExpanded }}
            >
              <Text style={s.disclosureText}>{battleExpanded ? 'Réduire' : 'En savoir plus'}</Text>
              <Text style={s.disclosureChevron}>{battleExpanded ? '⌃' : '⌄'}</Text>
            </TouchableOpacity>
            {/* Adel (04/09/2026) : "oublie pas de rajouter aussi dans les
                offres de bien expliquer les règles pour les Battle" -- le
                texte disait encore "le vainqueur gagne X Free par
                adversaire battu" (gagnant unique), faux depuis que le
                podium à 2 places existe pour les Battle à 3 joueurs et
                plus. Affiche maintenant la phrase que le serveur construit
                lui-même à partir des vrais réglages -- une seule source de
                vérité, plus jamais un texte à mettre à jour à la main
                quand le pourcentage change dans Remote Config. */}
            {battleExpanded ? <View style={s.battleDetails}>
              <Text style={s.battleDetailText}>Battle de 2 à {battleRules.maxPlayers} joueurs : à 2, le vainqueur remporte la mise de l’adversaire. À 3 et plus, le 1er et le 2e se partagent la mise de tous ceux classés 3e et plus.</Text>
              <Text style={s.battleDetailHint}>{battleRules.ruleText || `Il faut au moins ${battleRules.minimumFreeRequired} Free pour entrer.`} Au maximum de joueurs, le 1er peut gagner jusqu’à +{battleRules.fullArenaNetPrize} Free. Si tu ne finis pas dans le podium, -{battleRules.stakeFree} Free.</Text>
            </View> : null}
          </View>
          {/* Adel (04/09/2026) : "il faut qu'il comprenne comment il peut
              recharger" -- les 4 façons d'obtenir plus de Free, réunies au
              même endroit une seule fois, plutôt que dispersées plan par
              plan. */}
          <View style={s.battleDetails}>
            <Text style={s.paidSectionTitle}>PLUS DE FREE, 4 FAÇONS</Text>
            <Text style={s.battleDetailText}>📣 Partage ton profil : plus tu gagnes d’abonnés, plus Loki t’offre de Free.</Text>
            <Text style={s.battleDetailText}>⚡ Gagne des Battles en ligne contre d’autres joueurs.</Text>
            <Text style={s.battleDetailText}>📅 Free offerts automatiquement chaque mois, selon ta formule.</Text>
            <Text style={s.battleDetailText}>💳 Passe à une formule payante pour plus de Free chaque mois.</Text>
          </View>
        </>}

        {!focusPlan ? <Text style={s.paidSectionTitle}>PREMIUM & PRO</Text> : null}

        {loading ? <ActivityIndicator color={colors.primaryLight} /> : error ? <Text style={s.error}>{error}</Text> : visiblePlans.map((plan) => {
          const active = plan.code === currentPlan;
          const focused = !!focusPlan && plan.code === focusPlan;
          const venueUnlimited = isEventChoice && plan.code === 'VENUE_PRO' && rules.venueEventsPerMonth == null;
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
              <Text style={s.planSummary}>{planSummary(plan.code)}</Text>
              <TouchableOpacity
                style={s.disclosureButton}
                onPress={() => setExpandedPlanCode((current) => current === plan.code ? null : plan.code)}
                accessibilityRole="button"
                accessibilityLabel={`En savoir plus sur ${planLabel(plan.code)}`}
                accessibilityState={{ expanded: expandedPlanCode === plan.code }}
              >
                <Text style={s.disclosureText}>{expandedPlanCode === plan.code ? 'Réduire' : 'En savoir plus'}</Text>
                <Text style={s.disclosureChevron}>{expandedPlanCode === plan.code ? '⌃' : '⌄'}</Text>
              </TouchableOpacity>
              {expandedPlanCode === plan.code ? <View style={s.planDetails}>
                {!!plan.description && <Text style={s.planDescription}>{plan.description}</Text>}
                <View style={s.benefitBox}>{benefitsFor(plan.code, rules, funnel, plan.monthlyFreeBonus).map((benefit) => <Text key={benefit} style={s.benefit}>• {benefit}</Text>)}</View>
                {plan.trialDays > 0 ? <Text style={s.trial}>Essai : {plan.trialDays} jours</Text> : null}
              </View> : null}
              {!active && plan.code !== 'FREE' ? (
                <TouchableOpacity style={[s.cta, venueUnlimited && s.ctaUnlimited]} onPress={() => navigation.setParams({ focusPlan: plan.code, sourceFeature: sourceFeature || 'PLAN_DETAILS' })} accessibilityRole="button">
                  <Text style={s.ctaText}>{venueUnlimited ? 'Voir Venue Pro · illimité' : `Voir ${planLabel(plan.code)}`}</Text>
                </TouchableOpacity>
              ) : null}
              {!active && plan.code !== 'FREE' && iapAvailable() && IAP_PRODUCT_IDS[plan.code] ? (
                <TouchableOpacity
                  style={s.purchaseCta}
                  disabled={purchasingPlan !== null}
                  onPress={() => void handlePurchase(plan.code)}
                  accessibilityRole="button"
                  accessibilityLabel={`S’abonner à ${planLabel(plan.code)}`}
                >
                  {purchasingPlan === plan.code ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.purchaseCtaText}>S’ABONNER · {money(plan)}</Text>}
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}

        {iapAvailable() ? (
          <TouchableOpacity style={s.restoreButton} disabled={restoring} onPress={() => void handleRestore()} accessibilityRole="button">
            <Text style={s.restoreButtonText}>{restoring ? 'Restauration…' : 'Restaurer mes achats'}</Text>
          </TouchableOpacity>
        ) : null}

        <View style={s.subscriptionCard}>
          <Text style={s.subscriptionTitle}>Règles simples</Text>
          <TouchableOpacity
            style={s.disclosureButton}
            onPress={() => setRulesExpanded((value) => !value)}
            accessibilityRole="button"
            accessibilityLabel="En savoir plus sur les règles"
            accessibilityState={{ expanded: rulesExpanded }}
          >
            <Text style={s.disclosureText}>{rulesExpanded ? 'Réduire' : 'En savoir plus'}</Text>
            <Text style={s.disclosureChevron}>{rulesExpanded ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>
          {rulesExpanded ? <View style={s.rulesDetails}>
            <Text style={s.subscriptionText}>• Écouter, reconnaître et PASSER ne consomment aucun Free.</Text>
            <Text style={s.subscriptionText}>• GARDER un morceau découvert avec Écouter utilise {rules.freeCostPerKeep} Free. Le récupérer depuis le profil d’un autre membre utilise 0 Free.</Text>
            <Text style={s.subscriptionText}>• Les bonus gagnés avec les partages, les abonnés et les Battles s’ajoutent à ta formule.</Text>
            <Text style={s.subscriptionText}>• La provenance d’une découverte reste rattachée au membre qui l’a reconnue avec Écouter.</Text>
          </View> : null}
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
  eventChoiceHintText: { color: '#FFF4C2', fontSize: 11, lineHeight: 16, fontWeight: '900', textAlign: 'center' },
  choiceHint: { marginTop: 10, borderRadius: 12, backgroundColor: '#151020', borderWidth: 1, borderColor: '#493369', paddingHorizontal: 10, paddingVertical: 8 },
  choiceHintText: { color: '#F8F6FC', fontSize: 11, lineHeight: 16, fontWeight: '800', textAlign: 'center' },
  promiseCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: '#151020', borderWidth: 1, borderColor: '#493369' },
  promiseEyebrow: { color: colors.primaryLight, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  promiseTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '900', lineHeight: 25, marginTop: 5 },
  promiseCommunity: { color: colors.keep, fontSize: 16, fontWeight: '900', lineHeight: 21, marginTop: 7 },
  discoveryCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: '#101D17', borderWidth: 1, borderColor: '#2C8A60' },
  discoveryEyebrow: { color: '#7CF2B9', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  discoveryTitle: { color: colors.textPrimary, fontSize: 17, lineHeight: 22, fontWeight: '900', marginTop: 5 },
  discoveryBody: { ...typography.caption, color: colors.textPrimary, lineHeight: 18, fontWeight: '700', marginTop: 7 },
  discoveryDetails: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#254936', gap: 9 },
  discoveryStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  discoveryStepNumber: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#173529', color: '#7CF2B9', textAlign: 'center', lineHeight: 22, fontSize: 10, fontWeight: '900' },
  discoveryStepText: { ...typography.caption, color: colors.textPrimary, lineHeight: 18, fontWeight: '700', flex: 1 },
  promiseBody: { color: '#F8F6FC', fontSize: 12, lineHeight: 18, marginTop: 8, fontWeight: '700' },
  creditCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: '#1A1225', borderWidth: 1, borderColor: colors.primary },
  creditTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  sectionTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '900' },
  creditBig: { color: colors.primaryLight, fontSize: 28, fontWeight: '900', marginTop: 3 },
  freePill: { borderRadius: 999, borderWidth: 1, borderColor: colors.keep, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#13251C' },
  freePillText: { color: colors.keep, fontSize: 9, fontWeight: '900' },
  creditText: { color: '#F8F6FC', fontSize: 12, lineHeight: 18, marginTop: 4, fontWeight: '700' },
  creditRule: { color:'#FFFFFF', fontSize: 11, lineHeight: 16, marginTop: 7, fontWeight: '700' },
  disclosureButton: { minHeight: 42, marginTop: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: '#493369', backgroundColor: '#151020', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  disclosureText: { color: colors.textPrimary, fontSize: 12, fontWeight: '900' },
  disclosureChevron: { color: colors.primaryLight, fontSize: 18, fontWeight: '900' },
  growthGrid: { flexDirection: 'row', gap: 7, marginTop: 12 },
  growthStat: { flex: 1, minHeight: 58, borderRadius: 12, backgroundColor: '#151020', borderWidth: 1, borderColor: '#3D324A', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  growthValue: { color: colors.textPrimary, fontSize: 16, fontWeight: '900' },
  growthLabel: { color: '#E9E3F0', fontSize: 8, lineHeight: 11, textAlign: 'center', marginTop: 2, fontWeight: '700' },
  breakdownBox: { marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: '#151020', borderWidth: 1, borderColor: '#3D324A' },
  breakdownTitle: { color: colors.textPrimary, fontSize: 11, fontWeight: '900', letterSpacing: .6, marginBottom: 6 },
  breakdownSubtitle: { color: colors.textPrimary, fontSize: 11, fontWeight: '900', letterSpacing: .6, marginTop: 8, marginBottom: 4 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 26, gap: 8 },
  breakdownLabel: { flex: 1, color: '#E9E3F0', fontSize: 11, fontWeight: '700' },
  breakdownValue: { color: '#7FF2B7', fontSize: 12, fontWeight: '900' },
  breakdownValueNegative: { color: '#FFB3C3' },
  rechargeBox: { marginTop: 13, borderRadius: 16, backgroundColor: '#101D17', borderWidth: 1, borderColor: '#2C8A60', padding: 11 },
  rechargeEyebrow: { color: '#7CF2B9', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  rechargeTitle: { color: '#FFFFFF', fontSize: 16, lineHeight: 21, fontWeight: '900', marginTop: 3 },
  rechargeIntro: { color: '#FFFFFF', fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 4 },
  rechargeItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: '#254936' },
  rechargeIcon: { width: 25, color: '#7CF2B9', fontSize: 19, fontWeight: '900', textAlign: 'center' },
  rechargeCopy: { flex: 1 },
  rechargeItemTitle: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  rechargeItemText: { color: '#FFFFFF', fontSize: 11, lineHeight: 16, fontWeight: '800', marginTop: 2 },
  rechargeHint: { color: '#FFFFFF', fontSize: 8, lineHeight: 12, fontWeight: '700', marginTop: 3 },
  startBonus: { marginTop: 10, borderRadius: 12, backgroundColor: '#17241D', paddingHorizontal: 9, paddingVertical: 8 },
  startBonusTitle: { color: '#7CF2B9', fontSize: 8, fontWeight: '900', letterSpacing: .7 },
  startBonusText: { color: '#FFFFFF', fontSize: 9, lineHeight: 13, fontWeight: '700', marginTop: 2 },
  otherRewards: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#493369', paddingTop: 10 },
  otherRewardsTitle: { color: colors.primaryLight, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  otherRewardsIntro: { color: '#FFFFFF', fontSize: 11, lineHeight: 16, marginTop: 5, marginBottom: 4, fontWeight: '800' },
  otherRewardsLine: { color: '#F8F6FC', fontSize: 11, lineHeight: 17, marginTop: 2, fontWeight: '700' },
  vibesDefinition: { color: '#FFFFFF', fontSize: 9, lineHeight: 14, marginTop: 7, fontWeight: '800' },
  communityOpportunity: { marginTop: 14, borderRadius: 14, backgroundColor: '#151020', borderWidth: 1, borderColor: colors.primaryLight, padding: 12 },
  communityOpportunityEyebrow: { color: colors.primaryLight, fontSize: 9, fontWeight: '900', letterSpacing: .9 },
  communityOpportunityTitle: { color: '#FFFFFF', fontSize: 15, lineHeight: 20, fontWeight: '900', marginTop: 5 },
  communityOpportunityText: { color: '#FFFFFF', fontSize: 11, lineHeight: 17, fontWeight: '700', marginTop: 6 },
  communityOpportunityNote: { color: '#FFFFFF', fontSize: 9, lineHeight: 14, fontWeight: '800', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#493369' },
  battleCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: '#17130B', borderWidth: 1, borderColor: '#D6AA36' },
  battleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  battleHeaderCopy: { flex: 1 },
  battleEyebrow: { color: '#FFF4C2', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  battleTitle: { color: colors.textPrimary, fontSize: 16, lineHeight: 21, fontWeight: '900', marginTop: 4 },
  battleDetails: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#5B4A19' },
  battleDetailText: { color: colors.textPrimary, fontSize: 11, lineHeight: 17, fontWeight: '800' },
  battleDetailHint: { color: '#FFF4C2', fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 5 },
  paidSectionTitle: { color: colors.primaryLight, fontSize: 11, fontWeight: '900', letterSpacing: 1.1, marginTop: 2 },
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
  planSummary: { ...typography.caption, color: colors.textPrimary, lineHeight: 18, marginTop: 9, fontWeight: '700' },
  planDetails: { marginTop: 2 },
  planDescription: { ...typography.caption, color: '#F8F6FC', lineHeight: 18, marginTop: 9, fontWeight: '700' },
  benefitBox: { marginTop: 8, gap: 2 },
  benefit: { color: '#F8F6FC', fontSize: 11, lineHeight: 17, fontWeight: '700' },
  trial: { color: colors.keep, fontSize: 11, fontWeight: '900', marginTop: 8 },
  cta: { minHeight: 42, borderRadius: 21, marginTop: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  ctaUnlimited: { backgroundColor: '#8A6A12' },
  ctaText: { color: colors.white, fontSize: 12, fontWeight: '900' },
  purchaseCta: { minHeight: 46, borderRadius: 23, marginTop: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.success, opacity: 1 },
  purchaseCtaText: { color: '#0A140F', fontSize: 13, fontWeight: '900' },
  restoreButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', marginTop: 4, marginBottom: 4 },
  restoreButtonText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  subscriptionCard: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: '#151020', borderWidth: 1, borderColor: '#3D324A' },
  subscriptionTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '900' },
  rulesDetails: { marginTop: 3, gap: 3 },
  subscriptionText: { ...typography.caption, color: '#F8F6FC', lineHeight: 18, marginTop: 5, fontWeight: '700' },
  allPlans: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  allPlansText: { color: colors.primaryLight, fontSize: 12, fontWeight: '900' },
  error: { color: colors.danger, textAlign: 'center', paddingVertical: 20 },
});