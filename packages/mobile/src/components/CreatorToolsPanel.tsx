import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { getEventCreationAccess, QuotaAccess } from '../services/growthAccessService';
import { hasFeature, requiredPlan } from '../services/entitlementService';
import { isFeatureEnabled } from '../services/featureFlagService';
import { loadCurrentPlanCode, loadPlans } from '../services/planService';
import { getPlaylistSaleAccess, PlaylistSaleAccess } from '../services/playlistSaleService';
import { createProfileService } from '../services/profileService';
import { supabase } from '../services/supabaseClient';
import { useUserStore } from '../store/useUserStore';
import { ProfileKind } from '../types';
import { colors } from '../theme/colors';
import { radius } from '../theme/spacing';
import { CERTIFICATION_META } from './ProfileCertificationBadge';

const CREATOR_KINDS: { key: ProfileKind; label: string }[] = [
  { key: 'CREATOR', label: 'Créateur' },
  { key: 'DJ', label: 'DJ' },
  { key: 'ARTIST', label: 'Artiste' },
  { key: 'PRODUCER', label: 'Producteur' },
];

const KIND_LABELS: Record<ProfileKind, string> = {
  USER: 'Utilisateur', CREATOR: 'Créateur', DJ: 'DJ', ARTIST: 'Artiste', PRODUCER: 'Producteur', VENUE: 'Lieu / établissement',
};

type TierBadgeProps = { tier: 'PREMIUM' | 'CREATOR' | 'VENUE'; active?: boolean };

// Règle (07/09/2026, Adel) : un badge de formule reprend toujours la couleur
// de la certification correspondante -- ces trois pastilles utilisaient des
// couleurs inventées à part (et mélangées entre elles), au lieu de reprendre
// bleu/violet/or comme partout ailleurs dans l'app.
function TierBadge({ tier, active = false }: TierBadgeProps) {
  const label = tier === 'PREMIUM' ? 'Loki PREMIUM' : tier === 'CREATOR' ? 'Loki CREATOR PRO' : 'Loki VENUE PRO';
  const certTier = tier === 'PREMIUM' ? 'PREMIUM' : tier === 'CREATOR' ? 'CREATOR_PRO' : 'VENUE_PRO';
  const tierColors = CERTIFICATION_META[certTier];
  return <View style={[s.tierBadge, { backgroundColor: `${tierColors.colors[tierColors.colors.length - 1]}33`, borderColor: tierColors.ring }]}>
    <View style={[s.tierDot, { backgroundColor: tierColors.ring, opacity: active ? 1 : 0.4 }]} />
    <Text style={[s.tierBadgeText, { color: tierColors.ring }]}>{label}</Text>
  </View>;
}

export default function CreatorToolsPanel({ navigation }: any) {
  const user = useUserStore((state) => state.user);
  const setUser = useUserStore((state) => state.setUser);
  const isLocalGuest = useUserStore((state) => state.isLocalGuest);
  const isDemoMode = useUserStore((state) => state.isDemoMode);
  const [planCode, setPlanCode] = useState('FREE');
  const [eventAccess, setEventAccess] = useState<QuotaAccess | null>(null);
  const [planPrices, setPlanPrices] = useState<Record<string, string>>({ PREMIUM: '2,99 € / mois', CREATOR_PRO: '9,99 € / mois', VENUE_PRO: '29,99 € / mois' });
  const [busy, setBusy] = useState(false);
  // Adel : brancher le flag "events" pour de vrai plutôt que de laisser un
  // interrupteur décoratif dans Super Admin -- coupe-circuit d'urgence réel.
  const [eventsFeatureEnabled, setEventsFeatureEnabled] = useState(false);
  useEffect(() => { let live = true; isFeatureEnabled('events').then((enabled) => live && setEventsFeatureEnabled(enabled)); return () => { live = false; }; }, []);
  // Adel (15/09/2026) : "je ne vois pas l'installation de Stripe ...
  // n'importe quel utilisateur pourra vendre sa playlist" -- le mode de
  // paiement sert maintenant a DEUX choses (evenements payants ET vente de
  // playlists), debloque par un seuil d'abonnes independant du plan payant
  // -- visible des qu'un des deux s'applique, pas seulement Creator Pro.
  const [saleAccess, setSaleAccess] = useState<PlaylistSaleAccess | null>(null);
  useEffect(() => {
    let live = true;
    if (!user || isLocalGuest || isDemoMode) { setSaleAccess(null); return undefined; }
    getPlaylistSaleAccess().then((v) => live && setSaleAccess(v)).catch(() => { if (live) setSaleAccess(null); });
    return () => { live = false; };
  }, [user?.id, isLocalGuest, isDemoMode]);

  useEffect(() => {
    let live = true;
    loadPlans().then((plans) => {
      if (!live) return;
      setPlanPrices((current) => {
        const next = { ...current };
        plans.forEach((plan) => { if (plan.monthlyAmount > 0) next[plan.code] = `${plan.monthlyAmount.toFixed(2).replace('.', ',')} € / mois`; });
        return next;
      });
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true;
    const loadAccess = async () => {
      if (!user || isLocalGuest || isDemoMode) {
        if (live) { setPlanCode('FREE'); setEventAccess(null); }
        return;
      }
      const code = await loadCurrentPlanCode(user.id).catch(() => 'FREE');
      if (!live) return;
      setPlanCode(code || 'FREE');
      const access = await getEventCreationAccess().catch(() => null);
      if (live) setEventAccess(access);
    };
    void loadAccess();
    const unsubscribe = navigation?.addListener?.('focus', () => { void loadAccess(); });
    return () => { live = false; unsubscribe?.(); };
  }, [user?.id, isLocalGuest, isDemoMode, navigation]);

  if (!user) return null;

  const premiumEnabled = planCode === 'PREMIUM' || planCode === 'CREATOR_PRO' || planCode === 'VENUE_PRO';
  const creatorKindEnabled = hasFeature(planCode, 'CREATOR_KIND');
  const venueKindEnabled = hasFeature(planCode, 'VENUE_KIND');
  const creatorEnabled = hasFeature(planCode, 'CREATE_EVENT');
  const eventCanCreate = Boolean(eventAccess?.allowed || eventAccess?.unlimited);

  const openPaywall = (feature: 'PROFILE_SHARE' | 'CREATOR_KIND' | 'VENUE_KIND' | 'CREATE_EVENT' = 'CREATE_EVENT', forcedPlan?: 'PREMIUM' | 'CREATOR_PRO' | 'VENUE_PRO') => {
    navigation.navigate('Offers', { focusPlan: forcedPlan || requiredPlan(feature), sourceFeature: feature });
  };

  const changeKind = async (kind: ProfileKind, feature?: 'CREATOR_KIND' | 'VENUE_KIND') => {
    if (feature && !hasFeature(planCode, feature)) return openPaywall(feature);
    if (isLocalGuest || isDemoMode || !supabase) return void Alert.alert('Compte requis', 'Crée ton compte Loki avant de modifier le type de profil.');
    if (kind === user.kind) return;
    setBusy(true);
    try {
      const next = { ...user, kind };
      await createProfileService(supabase).saveOwnProfile(next);
      setUser(next);
      Alert.alert('Type de profil', `Ton profil est maintenant « ${KIND_LABELS[kind]} ».`);
    } catch (e: any) { Alert.alert('Type de profil', e?.message || 'Impossible de modifier le type de profil.'); }
    finally { setBusy(false); }
  };

  // Adel (15/09/2026) : "j'ai créé ma soirée du mois. Quand je clique
  // dessus, ça ne me propose pas la même chose que quand je clique sur
  // Soirée -- il faut le même design et les mêmes fonctions" -- BUG RÉEL :
  // une fois la soirée du mois déjà créée (quota utilisé), ce bouton
  // redirigeait vers l'offre Venue Pro au lieu de montrer l'événement déjà
  // créé. Le seul cas où le quota est épuisé pour un compte déjà
  // creatorEnabled (seule condition d'affichage de ce bouton), c'est
  // "déjà utilisé ce mois-ci" -- direction vers Soirées (même écran que
  // l'onglet), jamais un nouveau paywall pour un évènement qui existe déjà.
  // Adel (15/09/2026) : "comment ça se fait qu'on n'a pas le même pop-up
  // que dans la rubrique Soirée ... je veux le même des deux côtés" -- ce
  // panneau avait sa propre création d'événement simplifiée (nom/date/lieu/
  // description seulement), divergente de celle de l'onglet Soirées (qui
  // vérifie en plus le seuil d'abonnés, gère l'édition, les images, le
  // QR...). Un seul formulaire désormais : ce bouton délègue à Soirées au
  // lieu de maintenir une deuxième version qui dérive.
  const openEventComposer = () => {
    if (!eventsFeatureEnabled) return Alert.alert('Événements', 'La création d’événements est temporairement suspendue.');
    if (!creatorEnabled) return openPaywall('CREATE_EVENT', 'CREATOR_PRO');
    // Soirée du mois déjà utilisée ce mois-ci (Creator Pro) : montrer
    // l'événement existant dans Soirées, jamais rouvrir un formulaire de
    // création qui redirigerait vers un palier payant pour rien.
    if (!eventCanCreate && !eventAccess?.unlimited) return navigation.navigate('Main', { screen: 'Parties' });
    navigation.navigate('Main', { screen: 'Parties', params: { openCreateEvent: true } });
  };

  const eventLabel = eventAccess?.unlimited ? '+ Créer une soirée · illimité' : eventAccess?.planCode === 'CREATOR_PRO' ? (eventCanCreate ? '+ Créer ma soirée du mois' : '👉 Voir ma soirée du mois dans Soirées') : '+ Créer un événement';

  return <View style={s.card}>
    <View style={s.header}><View><Text style={s.eyebrow}>ESPACE CRÉATEUR</Text><Text style={s.title}>Profil, visibilité & communauté</Text></View></View>

    <Text style={s.planSectionTitle}>Débloquer plus</Text>
    <TouchableOpacity style={[s.planChoiceLocked, premiumEnabled && s.planChoiceActive]} onPress={() => navigation.navigate('Offers', { focusPlan: 'PREMIUM', sourceFeature: 'PROFILE_SHARE' })} accessibilityLabel="Premium 2,99 euros par mois">
      <View style={s.planChoiceText}><View style={s.planHeadingRow}><TierBadge tier="PREMIUM" active={premiumEnabled} /><Text style={s.planPrice}>{planPrices.PREMIUM}</Text></View><Text style={s.planChoiceSubtitle}>Découvertes illimitées, Vibes publiques et usage Premium. Le type de profil reste Utilisateur.</Text></View><Text style={s.planChoiceArrow}>›</Text>
    </TouchableOpacity>

    {creatorKindEnabled ? <>
      <View style={s.unlockedHeading}><TierBadge tier="CREATOR" active /><Text style={s.planPrice}>{planPrices.CREATOR_PRO}</Text></View>
      <Text style={s.planChoiceSubtitle}>Vibes automatiques illimitées + profils DJ, Artiste, Créateur ou Producteur + 1 soirée par mois.</Text>
      <View style={s.kindWrap}>{CREATOR_KINDS.map((item) => <TouchableOpacity key={item.key} style={[s.kindChip, user.kind === item.key && s.kindChipOn]} onPress={() => changeKind(item.key, 'CREATOR_KIND')} disabled={busy}><Text style={[s.kindText, user.kind === item.key && s.kindTextOn]}>{item.label}</Text></TouchableOpacity>)}</View>
    </> : <TouchableOpacity style={s.planChoiceLocked} onPress={() => openPaywall('CREATOR_KIND')} disabled={busy} accessibilityLabel="Creator Pro requis"><View style={s.planChoiceText}><View style={s.planHeadingRow}><TierBadge tier="CREATOR" /><Text style={s.planPrice}>{planPrices.CREATOR_PRO}</Text></View><Text style={s.planChoiceSubtitle}>Vibes automatiques · DJ · Artiste · Créateur · Producteur · 1 soirée par mois.</Text></View><Text style={s.planChoiceArrow}>›</Text></TouchableOpacity>}

    {venueKindEnabled ? <><View style={s.unlockedHeading}><TierBadge tier="VENUE" active /><Text style={s.planPrice}>{planPrices.VENUE_PRO}</Text></View><TouchableOpacity style={[s.kindChip, user.kind === 'VENUE' && s.kindChipOn]} onPress={() => changeKind('VENUE', 'VENUE_KIND')} disabled={busy}><Text style={[s.kindText, user.kind === 'VENUE' && s.kindTextOn]}>Lieu / établissement</Text></TouchableOpacity><Text style={s.planChoiceSubtitle}>Soirées illimitées + outils professionnels Venue.</Text></> : <TouchableOpacity style={s.planChoiceLocked} onPress={() => openPaywall('VENUE_KIND')} disabled={busy} accessibilityLabel="Venue Pro requis"><View style={s.planChoiceText}><View style={s.planHeadingRow}><TierBadge tier="VENUE" /><Text style={s.planPrice}>{planPrices.VENUE_PRO}</Text></View><Text style={s.planChoiceSubtitle}>Creator Pro inclus + profil Lieu / établissement + soirées illimitées.</Text></View><Text style={s.planChoiceArrow}>›</Text></TouchableOpacity>}

    {/* Adel (15/09/2026) : "il y a un bouton qui ne sert à rien, revenir au
        profil utilisateur ... en haut on a un bouton pour revenir" -- pris
        pour un doublon du bouton de retour en haut de l'écran, alors qu'il
        fait tout autre chose : repasser le TYPE de profil (DJ/Artiste/
        Créateur/Producteur) à Utilisateur standard, jamais une navigation.
        Libellé désambiguïsé + vrai contour de bouton pour ne plus le
        confondre avec un lien de navigation. */}
    {user.kind !== 'USER' ? <TouchableOpacity style={s.standardProfileLink} onPress={() => changeKind('USER')} disabled={busy} accessibilityLabel="Redevenir un profil Utilisateur standard"><Text style={s.standardProfileLinkText}>↩ Redevenir un profil Utilisateur standard</Text></TouchableOpacity> : null}

    <Text style={s.subscriptionNote}>Le plan actif pilote réellement les cadenas. Si l’abonnement s’arrête, les données restent mais les fonctions payantes se reverrouillent.</Text>

    {creatorEnabled && eventsFeatureEnabled ? <><TouchableOpacity style={[s.eventButton, !eventCanCreate && !eventAccess?.unlimited && s.eventButtonLocked]} onPress={() => void openEventComposer()}><Text style={s.eventButtonText}>{eventLabel}</Text></TouchableOpacity><Text style={s.hint}>{eventAccess?.unlimited ? 'Venue Pro : créations illimitées.' : eventAccess?.planCode === 'CREATOR_PRO' ? 'Creator Pro : 1 création de soirée par mois. Venue Pro retire cette limite.' : 'Les réponses Oui / Peut-être / Non restent dans l’onglet Soirées.'}</Text></> : null}

    {/* Adel (08/09/2026, puis 15/09/2026) : "trouver une place dans les
        paramètres avec des explications ... débloqué lorsque les évènements
        payants seront possible ... sinon ça sert à rien de l'intégrer" --
        puis "je ne vois pas l'installation de Stripe ... super simple à
        installer" pour la vente de playlists. Un seul mode de paiement
        (un seul compte Stripe/PayPal par utilisateur) sert les deux usages
        -- vitrine informative tant que Stripe Connect n'est pas branché
        côté serveur (démarche réservée à Adel), jamais une fausse connexion.
        Visible dès que L'UN des deux usages s'applique (évènements payants
        Creator Pro/Venue Pro, OU seuil d'abonnés atteint pour vendre une
        playlist -- n'importe quelle formule, pas seulement Creator Pro). */}
    {creatorEnabled || saleAccess?.unlocked ? (() => {
      const usages: string[] = [];
      if (creatorEnabled) usages.push('encaisser le prix d’entrée de tes évènements payants');
      if (saleAccess?.unlocked) usages.push('encaisser tes ventes de playlists');
      const usageText = usages.join(' et ');
      return <TouchableOpacity
        style={s.paymentTeaser}
        onPress={() => Alert.alert(
          '💳 Mode de paiement',
          `Bientôt : connecte ton propre compte Stripe (ou PayPal) pour ${usageText}. L’argent arrivera sur TON compte, jamais sur celui de Loki -- Loki ne prend aucune commission pour l’instant. Cette option se débloquera automatiquement dès que ce sera prêt côté serveur -- inutile de la configurer avant.`,
        )}
      >
        <Text style={s.paymentTeaserTitle}>💳 Mode de paiement · Bientôt disponible</Text>
        <Text style={s.paymentTeaserText}>Connecte ton Stripe/PayPal pour {usageText}.</Text>
      </TouchableOpacity>;
    })() : saleAccess && !saleAccess.unlocked ? (
      <View style={s.paymentTeaser}>
        <Text style={s.paymentTeaserTitle}>💶 Vendre mes playlists</Text>
        <Text style={s.paymentTeaserText}>Débloqué à partir de {saleAccess.threshold} abonnés -- tu en as {saleAccess.followers} pour l’instant.</Text>
      </View>
    ) : (
      // Adel (15/09/2026) : "je n'ai pas vu encore l'emplacement pour les
      // modes de paiement" -- avant, ce bloc disparaissait complètement le
      // temps que saleAccess se charge (ou pour un compte invité/démo),
      // donc invisible la plupart du temps. Toujours quelque chose à
      // l'écran maintenant, jamais un emplacement introuvable.
      <View style={s.paymentTeaser}>
        <Text style={s.paymentTeaserTitle}>💳 Mode de paiement</Text>
        <Text style={s.paymentTeaserText}>Connecte ton propre Stripe ou PayPal pour encaisser tes ventes (playlists, évènements) directement sur TON compte. Se débloque selon ta formule ou tes abonnés -- crée ton compte Loki pour voir ta progression.</Text>
      </View>
    )}
  </View>;
}

const s = StyleSheet.create({
  // Adel (15/09/2026) : correction d'une cascade sed maladroite (un premier
  // passage avait re-transforme certaines tailles deja augmentees) --
  // valeurs reprises a la main, avec un lineHeight qui depasse toujours le
  // fontSize (jamais egal, sinon texte multi-lignes trop serre).
  card:{marginHorizontal:18,marginTop:10,padding:14,borderRadius:radius.lg,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369'},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},eyebrow:{color:colors.primaryLight,fontSize:13,fontWeight:'900',letterSpacing:1.1},title:{color:colors.textPrimary,fontSize:16,fontWeight:'900',marginTop:3},planSectionTitle:{color:colors.primaryLight,fontSize:15,fontWeight:'900',marginTop:10,marginBottom:7},kindWrap:{flexDirection:'row',flexWrap:'wrap',gap:6},kindChip:{alignSelf:'flex-start',paddingHorizontal:10,paddingVertical:8,borderRadius:999,backgroundColor:'#211A2B',borderWidth:1,borderColor:'#40354E',marginBottom:7},kindChipOn:{backgroundColor:'#5B3F8C',borderColor:'#A884FA'},kindText:{color:'#FFFFFF',fontSize:14,fontWeight:'800'},kindTextOn:{color:'#FFF'},planChoiceLocked:{minHeight:62,borderRadius:14,backgroundColor:'#211A2B',borderWidth:1,borderColor:'#493369',paddingHorizontal:12,paddingVertical:9,marginBottom:7,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},planChoiceActive:{borderColor:colors.primaryLight,backgroundColor:'#34234F'},planChoiceText:{flex:1,paddingRight:8},planHeadingRow:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:7},unlockedHeading:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:7,marginTop:9,marginBottom:5},planPrice:{color:'#E9DFFF',fontSize:15,fontWeight:'900'},tierBadge:{minHeight:24,borderRadius:999,borderWidth:1,paddingHorizontal:8,flexDirection:'row',alignItems:'center',gap:5},tierPremium:{backgroundColor:'#2A203A',borderColor:'#B993FF'},tierCreator:{backgroundColor:'#2C2530',borderColor:'#D5B46A'},tierVenue:{backgroundColor:'#1C2A34',borderColor:'#7DC5E8'},tierBadgeText:{color:'#FFFFFF',fontSize:13,fontWeight:'900',letterSpacing:.55},tierDot:{width:6,height:6,borderRadius:3,backgroundColor:'#6D6376'},tierDotActive:{backgroundColor:'#FFFFFF'},planChoiceSubtitle:{color:'#FFFFFF',fontSize:14,lineHeight:19,marginTop:4},planChoiceArrow:{color:colors.primaryLight,fontSize:24,fontWeight:'700'},standardProfileLink:{minHeight:44,alignItems:'center',justifyContent:'center',marginTop:9,borderRadius:22,borderWidth:1,borderColor:'#40354E',backgroundColor:'#211A2B',paddingHorizontal:14},standardProfileLinkText:{color:'#FFFFFF',fontSize:14,fontWeight:'800'},subscriptionNote:{color:'#FFFFFF',fontSize:14,lineHeight:19,marginTop:6,paddingTop:9,borderTopWidth:1,borderTopColor:'#3D324A'},hint:{color:colors.textMuted,fontSize:14,lineHeight:19,marginTop:7},eventButton:{minHeight:45,borderRadius:23,alignItems:'center',justifyContent:'center',backgroundColor:colors.primary,marginTop:13},eventButtonLocked:{backgroundColor:'#21182F',borderWidth:1,borderColor:'#493369'},eventButtonText:{color:'#FFF',fontSize:15,fontWeight:'900'},paymentTeaser:{marginTop:10,padding:12,borderRadius:14,backgroundColor:'#17121D',borderWidth:1,borderColor:'#3B2E4E'},paymentTeaserTitle:{color:'#FFD166',fontSize:15,fontWeight:'900'},paymentTeaserText:{color:colors.textMuted,fontSize:14,lineHeight:19,marginTop:4},
});
