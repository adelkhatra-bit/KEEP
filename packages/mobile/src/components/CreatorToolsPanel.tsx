import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { broadcastEventToFollowers, createCreatorEvent } from '../services/creatorEventService';
import { getEventCreationAccess, QuotaAccess } from '../services/growthAccessService';
import { hasFeature, requiredPlan } from '../services/entitlementService';
import { loadCurrentPlanCode, loadPlans } from '../services/planService';
import { createProfileService } from '../services/profileService';
import { supabase } from '../services/supabaseClient';
import { useUserStore } from '../store/useUserStore';
import { ProfileKind } from '../types';
import { colors } from '../theme/colors';
import { radius } from '../theme/spacing';

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

function TierBadge({ tier, active = false }: TierBadgeProps) {
  const label = tier === 'PREMIUM' ? 'KEEP PREMIUM' : tier === 'CREATOR' ? 'KEEP CREATOR PRO' : 'KEEP VENUE PRO';
  return <View style={[s.tierBadge, tier === 'PREMIUM' ? s.tierPremium : tier === 'CREATOR' ? s.tierCreator : s.tierVenue]}>
    <View style={[s.tierDot, active && s.tierDotActive]} />
    <Text style={s.tierBadgeText}>{label}</Text>
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
    if (isLocalGuest || isDemoMode || !supabase) return void Alert.alert('Compte requis', 'Crée ton compte KEEP avant de modifier le type de profil.');
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
      Alert.alert('Événement publié', notifyFollowers ? `${event.name} est créé. ${sent} abonné(s) ont reçu l’invitation dans KEEP.` : `${event.name} est créé.`);
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

    {creatorEnabled ? <><TouchableOpacity style={[s.eventButton, !eventCanCreate && !eventAccess?.unlimited && s.eventButtonLocked]} onPress={() => void openEventComposer()}><Text style={s.eventButtonText}>{eventLabel}</Text></TouchableOpacity><Text style={s.hint}>{eventAccess?.unlimited ? 'Venue Pro : créations illimitées.' : eventAccess?.planCode === 'CREATOR_PRO' ? 'Creator Pro : 1 création de soirée par mois. Venue Pro retire cette limite.' : 'Les réponses Oui / Peut-être / Non restent dans l’onglet Soirées.'}</Text></> : null}

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
  card:{marginHorizontal:18,marginTop:10,padding:14,borderRadius:radius.lg,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369'},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},eyebrow:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:1.1},title:{color:colors.textPrimary,fontSize:14,fontWeight:'900',marginTop:3},planSectionTitle:{color:colors.primaryLight,fontSize:10,fontWeight:'900',marginTop:10,marginBottom:7},kindWrap:{flexDirection:'row',flexWrap:'wrap',gap:6},kindChip:{alignSelf:'flex-start',paddingHorizontal:10,paddingVertical:8,borderRadius:999,backgroundColor:'#211A2B',borderWidth:1,borderColor:'#40354E',marginBottom:7},kindChipOn:{backgroundColor:'#5B3F8C',borderColor:'#A884FA'},kindText:{color:'#B9AEC6',fontSize:10,fontWeight:'800'},kindTextOn:{color:'#FFF'},planChoiceLocked:{minHeight:62,borderRadius:14,backgroundColor:'#211A2B',borderWidth:1,borderColor:'#493369',paddingHorizontal:12,paddingVertical:9,marginBottom:7,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},planChoiceActive:{borderColor:colors.primaryLight,backgroundColor:'#34234F'},planChoiceText:{flex:1,paddingRight:8},planHeadingRow:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:7},unlockedHeading:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:7,marginTop:9,marginBottom:5},planPrice:{color:'#E9DFFF',fontSize:11,fontWeight:'900'},tierBadge:{minHeight:24,borderRadius:999,borderWidth:1,paddingHorizontal:8,flexDirection:'row',alignItems:'center',gap:5},tierPremium:{backgroundColor:'#2A203A',borderColor:'#B993FF'},tierCreator:{backgroundColor:'#2C2530',borderColor:'#D5B46A'},tierVenue:{backgroundColor:'#1C2A34',borderColor:'#7DC5E8'},tierBadgeText:{color:'#FFFFFF',fontSize:8,fontWeight:'900',letterSpacing:.55},tierDot:{width:6,height:6,borderRadius:3,backgroundColor:'#6D6376'},tierDotActive:{backgroundColor:'#FFFFFF'},planChoiceSubtitle:{color:'#968AA4',fontSize:10,lineHeight:15,marginTop:4},planChoiceArrow:{color:colors.primaryLight,fontSize:24,fontWeight:'700'},standardProfileLink:{minHeight:34,alignItems:'center',justifyContent:'center',marginTop:5},standardProfileLinkText:{color:'#94889F',fontSize:9,fontWeight:'800'},subscriptionNote:{color:'#B9AEC6',fontSize:10,lineHeight:15,marginTop:6,paddingTop:9,borderTopWidth:1,borderTopColor:'#3D324A'},hint:{color:colors.textMuted,fontSize:10,lineHeight:15,marginTop:7},eventButton:{minHeight:45,borderRadius:23,alignItems:'center',justifyContent:'center',backgroundColor:colors.primary,marginTop:13},eventButtonLocked:{backgroundColor:'#21182F',borderWidth:1,borderColor:'#493369'},eventButtonText:{color:'#FFF',fontSize:11,fontWeight:'900'},backdrop:{flex:1,backgroundColor:'rgba(3,2,7,.78)',justifyContent:'flex-end',alignItems:'center'},sheet:{width:'100%',maxWidth:520,maxHeight:'88%',backgroundColor:'#151020',borderTopLeftRadius:26,borderTopRightRadius:26,borderWidth:1,borderColor:'#493369',padding:18,paddingBottom:28},modalHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:8},modalTitle:{color:'#FFF',fontSize:19,fontWeight:'900'},close:{color:colors.primaryLight,fontSize:12,fontWeight:'800'},input:{minHeight:48,borderRadius:14,borderWidth:1,borderColor:'#40354E',backgroundColor:'#0E0A14',paddingHorizontal:13,color:'#FFF',fontSize:13,marginTop:9},multiline:{minHeight:82,paddingTop:12,textAlignVertical:'top'},primary:{minHeight:50,borderRadius:25,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:14},primaryText:{color:'#FFF',fontSize:11,fontWeight:'900'},secondary:{minHeight:44,alignItems:'center',justifyContent:'center'},secondaryText:{color:colors.primaryLight,fontSize:11,fontWeight:'800'},
});
