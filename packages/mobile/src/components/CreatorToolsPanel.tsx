import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { broadcastEventToFollowers, createCreatorEvent } from '../services/creatorEventService';
import { hasFeature, requiredPlan } from '../services/entitlementService';
import { loadCurrentPlanCode } from '../services/planService';
import { createProfileService } from '../services/profileService';
import { supabase } from '../services/supabaseClient';
import { useUserStore } from '../store/useUserStore';
import { ProfileKind } from '../types';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';

const KINDS: { key: ProfileKind; label: string; feature?: 'CREATOR_KIND' | 'VENUE_KIND' }[] = [
  { key: 'USER', label: 'Utilisateur' },
  { key: 'CREATOR', label: 'Créateur', feature: 'CREATOR_KIND' },
  { key: 'DJ', label: 'DJ', feature: 'CREATOR_KIND' },
  { key: 'ARTIST', label: 'Artiste', feature: 'CREATOR_KIND' },
  { key: 'PRODUCER', label: 'Producteur', feature: 'CREATOR_KIND' },
  { key: 'VENUE', label: 'Lieu / établissement', feature: 'VENUE_KIND' },
];

export default function CreatorToolsPanel({ navigation }: any) {
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const [planCode, setPlanCode] = useState('FREE');
  const [loadingPlan, setLoadingPlan] = useState(true);
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
    if (!user || isLocalGuest || isDemoMode) { setPlanCode('FREE'); setLoadingPlan(false); return; }
    loadCurrentPlanCode(user.id).then((code) => live && setPlanCode(code || 'FREE')).catch(() => live && setPlanCode('FREE')).finally(() => live && setLoadingPlan(false));
    return () => { live = false; };
  }, [user?.id, isLocalGuest, isDemoMode]);

  if (!user) return null;

  const creatorEnabled = hasFeature(planCode, 'CREATE_EVENT');

  const openPaywall = (feature: 'CREATOR_KIND' | 'VENUE_KIND' | 'CREATE_EVENT' = 'CREATE_EVENT') => {
    const plan = requiredPlan(feature);
    Alert.alert(
      `${plan === 'VENUE_PRO' ? 'Venue Pro' : 'Creator Pro'} requis`,
      plan === 'VENUE_PRO'
        ? 'Le profil établissement et les outils dédiés nécessitent Venue Pro.'
        : 'Les profils DJ / Artiste / Créateur et les événements avec notification aux abonnés nécessitent Creator Pro.',
      [{ text: 'Plus tard', style: 'cancel' }, { text: 'Voir les formules', onPress: () => navigation.navigate('Offers') }],
    );
  };

  const changeKind = async (kind: ProfileKind, feature?: 'CREATOR_KIND' | 'VENUE_KIND') => {
    if (feature && !hasFeature(planCode, feature)) return openPaywall(feature);
    if (isLocalGuest || isDemoMode || !supabase) {
      Alert.alert('Compte requis', 'Crée ton compte KEEP avant de modifier le type de profil.');
      return;
    }
    if (kind === user.kind) return;
    setBusy(true);
    try {
      const next = { ...user, kind };
      await createProfileService(supabase).saveOwnProfile(next);
      setUser(next);
      Alert.alert('Type de profil', `Ton profil est maintenant « ${KINDS.find((item) => item.key === kind)?.label || kind} ».`);
    } catch (e: any) {
      Alert.alert('Type de profil', e?.message || 'Impossible de modifier le type de profil.');
    } finally { setBusy(false); }
  };

  const parseDate = () => {
    const clean = startsAt.trim();
    if (!clean) return null;
    const parsed = new Date(clean.length === 16 ? `${clean}:00` : clean);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  };

  const publish = async (notifyFollowers: boolean) => {
    if (!creatorEnabled) return openPaywall('CREATE_EVENT');
    const iso = parseDate();
    if (name.trim().length < 3) return Alert.alert('Événement', 'Indique un nom d’événement.');
    if (!iso) return Alert.alert('Événement', 'Indique la date au format AAAA-MM-JJTHH:MM, par exemple 2026-09-12T22:00.');
    setBusy(true);
    try {
      const event = await createCreatorEvent({
        name: name.trim(),
        description: description.trim(),
        venueName: venueName.trim(),
        startsAt: iso,
        countryCode: countryCode.trim().toUpperCase().slice(0, 2),
        djArtistNames: [user.username],
      });
      let sent = 0;
      if (notifyFollowers) sent = await broadcastEventToFollowers(event.id, message.trim());
      setEventOpen(false);
      setName(''); setStartsAt(''); setVenueName(''); setDescription(''); setMessage('');
      Alert.alert('Événement publié', notifyFollowers ? `${event.name} est créé. ${sent} abonné(s) ont reçu l’invitation dans KEEP.` : `${event.name} est créé.`);
    } catch (e: any) {
      if (String(e?.message).includes('CREATOR_PRO_REQUIRED')) openPaywall('CREATE_EVENT');
      else Alert.alert('Événement', e?.message || 'Impossible de publier cet événement.');
    } finally { setBusy(false); }
  };

  return <View style={s.card}>
    <View style={s.header}>
      <View><Text style={s.eyebrow}>ESPACE CRÉATEUR</Text><Text style={s.title}>Profil, événements & communauté</Text></View>
      <View style={[s.planBadge, creatorEnabled && s.planBadgeOn]}><Text style={s.planText}>{loadingPlan ? '…' : planCode}</Text></View>
    </View>

    <Text style={s.label}>Type de profil</Text>
    <View style={s.kindWrap}>{KINDS.map((item) => {
      const locked = Boolean(item.feature && !hasFeature(planCode, item.feature));
      return <TouchableOpacity key={item.key} style={[s.kindChip, user.kind === item.key && s.kindChipOn, locked && s.kindChipLocked]} onPress={() => changeKind(item.key, item.feature)} disabled={busy}>
        <Text style={[s.kindText, user.kind === item.key && s.kindTextOn]}>{locked ? '🔒 ' : ''}{item.label}</Text>
      </TouchableOpacity>;
    })}</View>
    <Text style={s.hint}>Utilisateur reste gratuit. DJ, Artiste, Créateur et Producteur nécessitent Creator Pro. Lieu / établissement nécessite Venue Pro.</Text>

    <TouchableOpacity style={[s.eventButton, !creatorEnabled && s.eventButtonLocked]} onPress={() => creatorEnabled ? setEventOpen(true) : openPaywall('CREATE_EVENT')}>
      <Text style={s.eventButtonText}>{creatorEnabled ? '+ Créer un événement' : '🔒 Créer un événement · Creator Pro'}</Text>
    </TouchableOpacity>
    <Text style={s.hint}>Une invitation peut être envoyée à tes abonnés. Ils répondent ensuite Oui / Peut-être / Non depuis l’onglet Soirées.</Text>

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
  card:{marginHorizontal:18,marginTop:10,padding:14,borderRadius:radius.lg,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369'},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},eyebrow:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:1.1},title:{color:colors.textPrimary,fontSize:14,fontWeight:'900',marginTop:3},planBadge:{paddingHorizontal:8,paddingVertical:5,borderRadius:999,backgroundColor:'#231B2E',borderWidth:1,borderColor:'#4B4056'},planBadgeOn:{borderColor:colors.primaryLight,backgroundColor:'#34234F'},planText:{color:'#D9C9FF',fontSize:9,fontWeight:'900'},label:{color:colors.textPrimary,fontSize:12,fontWeight:'900',marginTop:14,marginBottom:7},kindWrap:{flexDirection:'row',flexWrap:'wrap',gap:6},kindChip:{paddingHorizontal:9,paddingVertical:7,borderRadius:999,backgroundColor:'#211A2B',borderWidth:1,borderColor:'#40354E'},kindChipOn:{backgroundColor:'#5B3F8C',borderColor:'#A884FA'},kindChipLocked:{opacity:.72},kindText:{color:'#B9AEC6',fontSize:10,fontWeight:'800'},kindTextOn:{color:'#FFF'},hint:{color:colors.textMuted,fontSize:10,lineHeight:15,marginTop:7},eventButton:{minHeight:45,borderRadius:23,alignItems:'center',justifyContent:'center',backgroundColor:colors.primary,marginTop:13},eventButtonLocked:{backgroundColor:'#292032',borderWidth:1,borderColor:'#4B4056'},eventButtonText:{color:'#FFF',fontSize:11,fontWeight:'900'},backdrop:{flex:1,backgroundColor:'rgba(3,2,7,.78)',justifyContent:'flex-end',alignItems:'center'},sheet:{width:'100%',maxWidth:520,maxHeight:'88%',backgroundColor:'#151020',borderTopLeftRadius:26,borderTopRightRadius:26,borderWidth:1,borderColor:'#493369',padding:18,paddingBottom:28},modalHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:8},modalTitle:{color:'#FFF',fontSize:19,fontWeight:'900'},close:{color:colors.primaryLight,fontSize:12,fontWeight:'800'},input:{minHeight:48,borderRadius:14,borderWidth:1,borderColor:'#40354E',backgroundColor:'#0E0A14',paddingHorizontal:13,color:'#FFF',fontSize:13,marginTop:9},multiline:{minHeight:82,paddingTop:12,textAlignVertical:'top'},primary:{minHeight:50,borderRadius:25,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:14},primaryText:{color:'#FFF',fontSize:11,fontWeight:'900'},secondary:{minHeight:44,alignItems:'center',justifyContent:'center'},secondaryText:{color:colors.primaryLight,fontSize:11,fontWeight:'800'},
});
