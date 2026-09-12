import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { broadcastEventToFollowers, createCreatorEvent } from '../services/creatorEventService';
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
  const [eventOpen, setEventOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [venueName, setVenueName] = useState('');
  const [countryCode, setCountryCode] = useState(user?.countryCode || 'FR');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
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

  const openEventComposer = async () => {
    if (!eventsFeatureEnabled) return Alert.alert('Événements', 'La création d’événements est temporairement suspendue.');
    if (!creatorEnabled) return openPaywall('CREATE_EVENT', 'CREATOR_PRO');
    const access = await getEventCreationAccess().catch(() => eventAccess);
    if (access) setEventAccess(access);
    if (!access || (!access.allowed && !access.unlimited)) return openPaywall('CREATE_EVENT', 'VENUE_PRO');
    setEventOpen(true);
  };

  const parseDate = () => {
    const clean = startsAt.trim();
    if (!clean) return null;
    const parsed = new Date(clean.length === 16 ? `${clean}:00` : clean);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  };

  const publish = async (notifyFollowers: boolean) => {
    if (!eventsFeatureEnabled) return Alert.alert('Événements', 'La création d’événements est temporairement suspendue.');
    if (!creatorEnabled) return openPaywall('CREATE_EVENT', 'CREATOR_PRO');
    const iso = parseDate();
    if (name.trim().length < 3) return Alert.alert('Événement', 'Indique un nom d’événement.');
    if (!iso) return Alert.alert('Événement', 'Indique la date au format AAAA-MM-JJTHH:MM, par exemple 2026-09-12T22:00.');
    setBusy(true);
    try {
      const event = await createCreatorEvent({ name: name.trim(), description: description.trim(), venueName: venueName.trim(), startsAt: iso, countryCode: countryCode.trim().toUpperCase().slice(0, 2), djArtistNames: [user.username] });
      let sent = 0;
      if (notifyFollowers) sent = await broadcastEventToFollowers(event.id, message.trim());
      setEventOpen(false);
      setName(''); setStartsAt(''); setVenueName(''); setDescription(''); setMessage('');
      setEventAccess(await getEventCreationAccess().catch(() => eventAccess));
      Alert.alert('Événement publié', notifyFollowers ? `${event.name} est créé. ${sent} abonné(s) ont reçu l’invitation dans Loki.` : `${event.name} est créé.`);
    } catch (e: any) {
      const code = String(e?.message || '');
      if (code.includes('VENUE_PRO_EVENT_LIMIT')) openPaywall('CREATE_EVENT', 'VENUE_PRO');
      else if (code.includes('CREATOR_PRO_REQUIRED')) openPaywall('CREATE_EVENT', 'CREATOR_PRO');
      else Alert.alert('Événement', code || 'Impossible de publier cet événement.');
    } finally { setBusy(false); }
  };

  const eventLabel = eventAccess?.unlimited ? '+ Créer une soirée · illimité' : eventAccess?.planCode === 'CREATOR_PRO' ? (eventCanCreate ? '+ Créer ma soirée du mois' : '🔒 Soirée du mois utilisée') : '+ Créer un événement';

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

    {user.kind !== 'USER' ? <TouchableOpacity style={s.standardProfileLink} onPress={() => changeKind('USER')} disabled={busy} accessibilityLabel="Revenir au profil utilisateur"><Text style={s.standardProfileLinkText}>Revenir au profil utilisateur</Text></TouchableOpacity> : null}

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

    <Modal visible={eventOpen} transparent animationType="slide" onRequestClose={() => setEventOpen(false)}>
      <View style={s.backdrop}><View style={s.sheet}>
        <View style={s.modalHeader}><Text style={s.modalTitle}>Créer un événement</Text><TouchableOpacity onPress={() => setEventOpen(false)}><Text style={s.close}>Fermer</Text></TouchableOpacity></View>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Nom de l’événement" placeholderTextColor={colors.textMuted}/>
          <TextInput style={s.input} value={startsAt} onChangeText={setStartsAt} placeholder="2026-09-12T22:00" placeholderTextColor={colors.textMuted} autoCapitalize="none"/>
          <TextInput style={s.input} value={venueName} onChangeText={setVenueName} placeholder="Lieu / établissement" placeholderTextColor={colors.textMuted}/>
          <TextInput style={s.input} value={countryCode} onChangeText={setCountryCode} placeholder="Pays (FR)" placeholderTextColor={colors.textMuted} autoCapitalize="characters" maxLength={2}/>
          <TextInput style={[s.input,s.multiline]} value={description} onChangeText={setDescription} placeholder="Description de l’événement" placeholderTextColor={colors.textMuted} multiline/>
          <TextInput style={[s.input,s.multiline]} value={message} onChangeText={setMessage} placeholder="Message aux abonnés (optionnel)" placeholderTextColor={colors.textMuted} multiline/>
          <TouchableOpacity style={s.primary} onPress={() => publish(true)} disabled={busy}>{busy ? <ActivityIndicator color="#FFF"/> : <Text style={s.primaryText}>PUBLIER + NOTIFIER MES ABONNÉS</Text>}</TouchableOpacity>
          <TouchableOpacity style={s.secondary} onPress={() => publish(false)} disabled={busy}><Text style={s.secondaryText}>Publier sans notification</Text></TouchableOpacity>
        </ScrollView>
      </View></View>
    </Modal>
  </View>;
}

const s = StyleSheet.create({
  card:{marginHorizontal:18,marginTop:10,padding:14,borderRadius:radius.lg,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369'},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},eyebrow:{color:colors.primaryLight,fontSize: 15,fontWeight:'900',letterSpacing:1.1},title:{color:colors.textPrimary,fontSize:14,fontWeight:'900',marginTop:3},planSectionTitle:{color:colors.primaryLight,fontSize: 15,fontWeight:'900',marginTop:10,marginBottom:7},kindWrap:{flexDirection:'row',flexWrap:'wrap',gap:6},kindChip:{alignSelf:'flex-start',paddingHorizontal:10,paddingVertical:8,borderRadius:999,backgroundColor:'#211A2B',borderWidth:1,borderColor:'#40354E',marginBottom:7},kindChipOn:{backgroundColor:'#5B3F8C',borderColor:'#A884FA'},kindText:{color:'#FFFFFF',fontSize: 15,fontWeight:'800'},kindTextOn:{color:'#FFF'},planChoiceLocked:{minHeight:62,borderRadius:14,backgroundColor:'#211A2B',borderWidth:1,borderColor:'#493369',paddingHorizontal:12,paddingVertical:9,marginBottom:7,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},planChoiceActive:{borderColor:colors.primaryLight,backgroundColor:'#34234F'},planChoiceText:{flex:1,paddingRight:8},planHeadingRow:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:7},unlockedHeading:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:7,marginTop:9,marginBottom:5},planPrice:{color:'#E9DFFF',fontSize: 14,fontWeight:'900'},tierBadge:{minHeight:24,borderRadius:999,borderWidth:1,paddingHorizontal:8,flexDirection:'row',alignItems:'center',gap:5},tierPremium:{backgroundColor:'#2A203A',borderColor:'#B993FF'},tierCreator:{backgroundColor:'#2C2530',borderColor:'#D5B46A'},tierVenue:{backgroundColor:'#1C2A34',borderColor:'#7DC5E8'},tierBadgeText:{color:'#FFFFFF',fontSize: 14,fontWeight:'900',letterSpacing:.55},tierDot:{width:6,height:6,borderRadius:3,backgroundColor:'#6D6376'},tierDotActive:{backgroundColor:'#FFFFFF'},planChoiceSubtitle:{color:'#FFFFFF',fontSize: 15,lineHeight:15,marginTop:4},planChoiceArrow:{color:colors.primaryLight,fontSize:24,fontWeight:'700'},standardProfileLink:{minHeight:34,alignItems:'center',justifyContent:'center',marginTop:5},standardProfileLinkText:{color:'#FFFFFF',fontSize: 15,fontWeight:'800'},subscriptionNote:{color:'#FFFFFF',fontSize: 15,lineHeight:15,marginTop:6,paddingTop:9,borderTopWidth:1,borderTopColor:'#3D324A'},hint:{color:colors.textMuted,fontSize: 15,lineHeight:15,marginTop:7},eventButton:{minHeight:45,borderRadius:23,alignItems:'center',justifyContent:'center',backgroundColor:colors.primary,marginTop:13},eventButtonLocked:{backgroundColor:'#21182F',borderWidth:1,borderColor:'#493369'},eventButtonText:{color:'#FFF',fontSize: 14,fontWeight:'900'},paymentTeaser:{marginTop:10,padding:12,borderRadius:14,backgroundColor:'#17121D',borderWidth:1,borderColor:'#3B2E4E'},paymentTeaserTitle:{color:'#FFD166',fontSize: 14,fontWeight:'900'},paymentTeaserText:{color:colors.textMuted,fontSize: 15,lineHeight:15,marginTop:4},backdrop:{flex:1,backgroundColor:'rgba(3,2,7,.78)',justifyContent:'flex-end',alignItems:'center'},sheet:{width:'100%',maxWidth:520,maxHeight:'88%',backgroundColor:'#151020',borderTopLeftRadius:26,borderTopRightRadius:26,borderWidth:1,borderColor:'#493369',padding:18,paddingBottom:28},modalHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:8},modalTitle:{color:'#FFF',fontSize:19,fontWeight:'900'},close:{color:colors.primaryLight,fontSize: 14,fontWeight:'800'},input:{minHeight:48,borderRadius:14,borderWidth:1,borderColor:'#40354E',backgroundColor:'#0E0A14',paddingHorizontal:13,color:'#FFF',fontSize: 15,marginTop:9},multiline:{minHeight:82,paddingTop:12,textAlignVertical:'top'},primary:{minHeight:50,borderRadius:25,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:14},primaryText:{color:'#FFF',fontSize: 14,fontWeight:'900'},secondary:{minHeight:44,alignItems:'center',justifyContent:'center'},secondaryText:{color:colors.primaryLight,fontSize: 14,fontWeight:'800'},
});
