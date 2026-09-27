import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme/colors';
import type { ProfileSaleSuggestion } from '../services/profileSaleSuggestionService';

type Props = {
  suggestions?: ProfileSaleSuggestion[];
  viewerKey?: string;
  onSuggestionPress?: (suggestion: ProfileSaleSuggestion) => void;
  onListenPress?: (suggestion: ProfileSaleSuggestion) => void;
  onParticipatePress: () => void;
  onOffersPress: () => void;
};

export default function ProfileOpportunityRail({ suggestions = [], viewerKey = 'guest', onSuggestionPress, onListenPress, onParticipatePress, onOffersPress }: Props) {
  const drift = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const reopenGlow = useRef(new Animated.Value(0)).current;
  const [tipIndex, setTipIndex] = React.useState(0);
  const [suggestionVisible, setSuggestionVisible] = useState(true);
  const storageKey = `keep:profile-opportunity-rail:${viewerKey}`;
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(storageKey).then((value) => { if (live) setSuggestionVisible(value !== 'hidden'); }).catch(() => {});
    return () => { live = false; };
  }, [storageKey]);
  const hideRail = () => { setSuggestionVisible(false); void AsyncStorage.setItem(storageKey, 'hidden'); };
  const showRail = () => { setSuggestionVisible(true); void AsyncStorage.setItem(storageKey, 'visible'); };
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const suggestion = suggestions[activeSuggestionIndex] ?? null;
  // Une nouvelle publication doit rouvrir automatiquement la zone même si
  // l'utilisateur l'avait masquée auparavant. Le masquage reste valable
  // pour le contenu courant, jamais pour une nouvelle pépite.
  useEffect(() => {
    const newestOfferId = suggestions[0]?.offerId;
    if (!newestOfferId) return;
    const latestKey = `${storageKey}:latest-offer`;
    AsyncStorage.getItem(latestKey).then((previousOfferId) => {
      if (previousOfferId && previousOfferId !== newestOfferId) {
        setSuggestionVisible(true);
        void AsyncStorage.setItem(storageKey, 'visible');
      }
      void AsyncStorage.setItem(latestKey, newestOfferId);
    }).catch(() => {});
  }, [storageKey, suggestions]);
  useEffect(() => {
    drift.setValue(0);
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(drift, { toValue: 1, duration: 4200, useNativeDriver: true }),
      Animated.timing(drift, { toValue: 0, duration: 4200, useNativeDriver: true }),
    ]));
    const pulseLoop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1400, useNativeDriver: true }),
    ]));
    const reopenLoop = Animated.loop(Animated.sequence([
      Animated.timing(reopenGlow,{toValue:1,duration:1100,useNativeDriver:false}),
      Animated.timing(reopenGlow,{toValue:0,duration:1100,useNativeDriver:false}),
    ]));
    loop.start(); pulseLoop.start(); reopenLoop.start();
    return () => { loop.stop(); pulseLoop.stop(); reopenLoop.stop(); };
  }, [drift, pulse, reopenGlow]);
  useEffect(() => {
    const timer = setInterval(() => setTipIndex((value) => (value + 1) % 5), 5200);
    return () => clearInterval(timer);
  }, []);

  const tips = [
    { kicker: '◆ FAIS CIRCULER TES PÉPITES', title: 'Ta découverte peut devenir la prochaine pépite de quelqu’un.', body: 'Publie une sélection : tes abonnés et ceux qui ont déjà gardé tes découvertes peuvent retrouver tes nouveautés.' },
    { kicker: '◆ À L’OREILLE, PAS À LA POCHETTE', title: 'Écoute d’abord. Débloque seulement si ça te parle.', body: 'Les sélections se découvrent par le son : moins de biais, plus de vraies surprises musicales.' },
    { kicker: '◆ CONSTRUIS TA COMMUNAUTÉ', title: 'Chaque pépite peut ramener quelqu’un vers ton univers.', body: 'Quand une découverte est reconnue à ton nom, elle crée un lien durable entre ton profil et ceux qui la gardent.' },
    { kicker: '◆ NOUVEAU DROP', title: 'Une nouvelle sélection vient de tomber.', body: 'Les nouveautés des profils que tu suis remontent automatiquement ici pour être écoutées sans chercher.' },
    { kicker: '◆ CRÉE TON RENDEZ-VOUS', title: 'Une soirée donne une raison de revenir.', body: 'Publie ton événement et transforme ton activité musicale en rendez-vous avec ta communauté.' },
  ];
  const tip = tips[tipIndex];

  useEffect(() => {
    if (activeSuggestionIndex >= suggestions.length) setActiveSuggestionIndex(0);
  }, [activeSuggestionIndex, suggestions.length]);
  const genres = suggestion?.genres?.length ? suggestion.genres.join(' · ') : 'Sélection musicale';
  const price = suggestion ? (suggestion.paymentMode === 'FREE' ? `${suggestion.freePrice ?? 0} FREE` : `${(suggestion.priceCents / 100).toFixed(2).replace('.', ',')}${suggestion.currencyCode === 'EUR' ? '€' : ` ${suggestion.currencyCode}`}`) : null;
  if (!suggestionVisible) return (
    <Animated.View style={[s.reopenGlowShell,{borderColor:reopenGlow.interpolate({inputRange:[0,1],outputRange:[colors.primary,colors.success]}),shadowOpacity:reopenGlow.interpolate({inputRange:[0,1],outputRange:[0.18,0.7]})}]}>
      <TouchableOpacity style={s.reopenRail} onPress={showRail} accessibilityLabel="Voir les découvertes">
        <Text style={s.reopenIcon}>✦</Text><View style={{flex:1}}><Text style={s.reopenTitle}>VOIR LES DÉCOUVERTES</Text><Text style={s.reopenMeta}>Sélections · soirées · opportunités</Text></View><Text style={s.reopenArrow}>›</Text>
      </TouchableOpacity>
    </Animated.View>
  );
  return (
    <View style={s.wrapper}>
      <View style={s.railHeader}><Text style={s.railHeaderTitle}>POUR TOI</Text><TouchableOpacity style={s.hideRailButton} onPress={hideRail} accessibilityLabel="Masquer Pour toi"><Text style={s.hideRailText}>MASQUER</Text></TouchableOpacity></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail} snapToInterval={286} decelerationRate="fast">
      <TouchableOpacity style={[s.card, s.suggestion]} onPress={() => suggestion && onSuggestionPress?.(suggestion)} disabled={!suggestion || !onSuggestionPress} accessibilityLabel={suggestion ? `Suggestion Loki de ${suggestion.sellerUsername}` : 'Suggestions Loki en préparation'}>
        <Animated.View pointerEvents="none" style={[s.aura,{opacity:pulse.interpolate({inputRange:[0,1],outputRange:[.08,.24]}),transform:[{scale:pulse.interpolate({inputRange:[0,1],outputRange:[.8,1.2]})}]}]} /><View style={s.top}><Text style={s.kicker}>✦ À ÉCOUTER · À DÉBLOQUER</Text><Animated.View style={[s.liveDot,{transform:[{scale:pulse.interpolate({inputRange:[0,1],outputRange:[.75,1.25]})}]}]} /></View>
        {suggestion ? <View style={s.saleLine}><Text style={s.saleBadge}>SÉLECTION EXCLUSIVE</Text><Text style={s.price}>{price}</Text></View> : null}
        {suggestion ? <View style={s.personRow}>{suggestion.sellerAvatarUrl ? <Image source={{ uri: suggestion.sellerAvatarUrl }} style={s.avatar} /> : <View style={s.avatarFallback}><Text style={s.avatarLetter}>{suggestion.sellerUsername.slice(0,1).toUpperCase()}</Text></View>}<View style={s.personText}><Text style={s.title} numberOfLines={1}>{suggestion.playlistName}</Text><Text style={s.meta} numberOfLines={1}>{suggestion.sellerUsername} · {suggestion.trackCount} pépite{suggestion.trackCount > 1 ? 's' : ''}</Text></View></View> : <Text style={s.title}>Ton prochain univers arrive…</Text>}
        {suggestion ? <Text style={s.ctaHint}>Écoute avant de débloquer · paiement sécurisé après ton choix</Text> : null}
        <View style={s.marqueeClip}><Animated.Text numberOfLines={1} style={[s.marquee,{transform:[{translateX:drift.interpolate({inputRange:[0,1],outputRange:[0,-26]})}]}]}>{suggestion ? `${suggestion.paymentMode === 'FREE' ? `${suggestion.freePrice ?? 0} FREE` : `${(suggestion.priceCents / 100).toFixed(2).replace('.', ',')} ${suggestion.currencyCode === 'EUR' ? '€' : suggestion.currencyCode}`} · ${genres} · À DÉBLOQUER` : `${genres} · DÉCOUVRE →`}</Animated.Text></View>
        {suggestion ? <View style={s.saleActions}><TouchableOpacity style={s.listen} onPress={(event) => { event.stopPropagation?.(); suggestion && (onListenPress ?? onSuggestionPress)?.(suggestion); }} accessibilityLabel="Écouter un extrait"><Text style={s.listenText}>▶ ÉCOUTER</Text></TouchableOpacity><View style={s.saleTag}><Text style={s.saleTagText}>{suggestion.paymentMode === 'FREE' ? `${suggestion.freePrice ?? 0} FREE` : `${(suggestion.priceCents / 100).toFixed(2).replace('.', ',')} ${suggestion.currencyCode === 'EUR' ? '€' : suggestion.currencyCode}`}</Text></View></View> : null}
        {suggestions.length > 1 ? <View style={s.offerPager}><TouchableOpacity onPress={(event) => { event.stopPropagation?.(); setActiveSuggestionIndex((value) => (value - 1 + suggestions.length) % suggestions.length); }}><Text style={s.offerPagerArrow}>‹</Text></TouchableOpacity><Text style={s.offerPagerText}>{activeSuggestionIndex + 1}/{suggestions.length}</Text><TouchableOpacity onPress={(event) => { event.stopPropagation?.(); setActiveSuggestionIndex((value) => (value + 1) % suggestions.length); }}><Text style={s.offerPagerArrow}>›</Text></TouchableOpacity></View> : null}
      </TouchableOpacity>

      <TouchableOpacity style={[s.card, s.participate]} onPress={tipIndex === 0 ? onParticipatePress : tipIndex === 1 ? onParticipatePress : onOffersPress} accessibilityLabel={tip.title}>
        <Text style={s.kicker}>{tip.kicker}</Text>
        <Text style={s.title}>{tip.title}</Text>
        <Text style={s.body}>{tip.body}</Text>
        <View style={s.tipFooter}><View style={s.tipDots}>{tips.map((_, index) => <View key={index} style={[s.tipDot, index === tipIndex && s.tipDotOn]} />)}</View><Text style={s.tipCta}>EN SAVOIR PLUS →</Text></View>
      </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s=StyleSheet.create({
  wrapper:{marginTop:2},
  railHeader:{marginHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  railHeaderTitle:{color:colors.textMuted,fontSize:9,fontWeight:'900',letterSpacing:1},
  hideRailButton:{minHeight:28,paddingHorizontal:10,borderRadius:14,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},hideRailText:{color:colors.textMuted,fontSize:9,fontWeight:'800'},
  reopenGlowShell:{marginHorizontal:18,marginVertical:8,borderWidth:2,borderRadius:18,padding:2,backgroundColor:colors.backgroundElevated,shadowColor:colors.primary,shadowRadius:10,shadowOffset:{width:0,height:0},elevation:5},
  reopenRail:{minHeight:52,paddingHorizontal:13,borderRadius:14,backgroundColor:colors.backgroundElevated,flexDirection:'row',alignItems:'center',gap:10},
  rail:{paddingHorizontal:18,paddingVertical:8,gap:10},
  card:{width:276,minHeight:132,borderRadius:18,padding:12,borderWidth:1,overflow:'hidden'},
  suggestion:{backgroundColor:colors.primaryFaint,borderColor:colors.primary},
  aura:{position:'absolute',right:-30,top:-55,width:160,height:160,borderRadius:80,backgroundColor:colors.primaryLight},
  participate:{backgroundColor:colors.backgroundElevated,borderColor:colors.border},
  offerPager:{position:'absolute',left:10,bottom:7,height:25,flexDirection:'row',alignItems:'center',gap:7},offerPagerArrow:{color:colors.primaryLight,fontSize:20,fontWeight:'900'},offerPagerText:{color:colors.textMuted,fontSize:8,fontWeight:'900'},
  dismissSuggestion:{position:'absolute',right:9,bottom:8,minHeight:24,paddingHorizontal:8,borderRadius:12,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},dismissSuggestionText:{color:colors.textMuted,fontSize:8,fontWeight:'800'},
  reopenSuggestion:{minHeight:70,backgroundColor:colors.backgroundElevated,borderColor:colors.border,flexDirection:'row',alignItems:'center',gap:10},reopenIcon:{color:colors.primaryLight,fontSize:18,fontWeight:'900'},reopenTitle:{color:colors.textPrimary,fontSize:10,fontWeight:'900',letterSpacing:.7},reopenMeta:{color:colors.textMuted,fontSize:9,fontWeight:'700',marginTop:3},reopenArrow:{color:colors.primaryLight,fontSize:22,fontWeight:'700'},
  top:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  kicker:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:1},
  liveDot:{width:7,height:7,borderRadius:4,backgroundColor:colors.success},
  saleLine:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:6,marginTop:6},saleBadge:{color:colors.success,fontSize:8,fontWeight:'900',letterSpacing:.6},price:{color:colors.textPrimary,fontSize:11,fontWeight:'900'},personRow:{flexDirection:'row',alignItems:'center',gap:9,marginTop:5},
  avatar:{width:32,height:32,borderRadius:16},
  avatarFallback:{width:32,height:32,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:colors.primary},
  avatarLetter:{color:'#fff',fontSize:15,fontWeight:'900'},
  personText:{flex:1,minWidth:0},
  title:{color:colors.textPrimary,fontSize:13,fontWeight:'900',marginTop:6},
  meta:{color:colors.textMuted,fontSize:10,fontWeight:'700',marginTop:2},
  ctaRow:{flexDirection:'row',alignItems:'center',gap:7,marginTop:7},listenCta:{paddingHorizontal:9,paddingVertical:6,borderRadius:10,backgroundColor:colors.primary},listenCtaText:{color:'#fff',fontSize:9,fontWeight:'900'},ctaHint:{color:colors.textMuted,fontSize:8,fontWeight:'700',marginTop:6},marqueeClip:{overflow:'hidden',marginTop:6},
  marquee:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:.8,width:360},offerCta:{marginTop:8,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},offerCtaText:{color:'#fff',fontSize:10,fontWeight:'900'},offerPrice:{color:colors.success,fontSize:11,fontWeight:'900'},
  saleActions:{marginTop:8,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},listen:{minHeight:32,paddingHorizontal:11,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:colors.primary},listenText:{color:'#fff',fontSize:9,fontWeight:'900'},saleTag:{minHeight:30,paddingHorizontal:9,borderRadius:11,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.success},saleTagText:{color:colors.success,fontSize:9,fontWeight:'900'},body:{color:colors.textMuted,fontSize:9,lineHeight:12,fontWeight:'700',marginTop:5},
  tipFooter:{marginTop:9,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},tipDots:{flexDirection:'row',gap:4},tipDot:{width:5,height:5,borderRadius:3,backgroundColor:colors.border},tipDotOn:{width:13,backgroundColor:colors.primaryLight},tipCta:{color:colors.primaryLight,fontSize:8,fontWeight:'900',letterSpacing:.5},
});
