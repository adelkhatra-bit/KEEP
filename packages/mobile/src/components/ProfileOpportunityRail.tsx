import React, { useEffect, useRef } from 'react';
import { Animated, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import type { ProfileSaleSuggestion } from '../services/profileSaleSuggestionService';

type Props = {
  suggestion?: ProfileSaleSuggestion | null;
  onSuggestionPress?: () => void;
  onListenPress?: () => void;
  onParticipatePress: () => void;
  onOffersPress: () => void;
};

export default function ProfileOpportunityRail({ suggestion, onSuggestionPress, onListenPress, onParticipatePress, onOffersPress }: Props) {
  const drift = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const [tipIndex, setTipIndex] = React.useState(0);
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
    loop.start(); pulseLoop.start();
    return () => { loop.stop(); pulseLoop.stop(); };
  }, [drift, pulse]);
  useEffect(() => {
    const timer = setInterval(() => setTipIndex((value) => (value + 1) % 3), 5200);
    return () => clearInterval(timer);
  }, []);

  const tips = [
    { kicker: '◆ FAIS CIRCULER TES PÉPITES', title: 'Partage ton profil, Loki propage le reste.', body: 'Tes abonnés et les personnes qui ont aimé ou gardé une découverte attribuée à ton profil peuvent retrouver tes nouveautés, sélections et événements.' },
    { kicker: '◆ CRÉE TON RENDEZ-VOUS', title: 'Une soirée devient une occasion de revenir.', body: 'Crée un événement : ton activité peut apparaître ici sans ajouter un nouveau bloc au profil.' },
    { kicker: '◆ CONSTRUIS TA COMMUNAUTÉ', title: 'Une découverte reconnue à ton nom continue de vivre.', body: 'Plus tes découvertes sont gardées et partagées, plus ton profil crée des raisons naturelles de revenir.' },
  ];
  const tip = tips[tipIndex];

  const genres = suggestion?.genres?.length ? suggestion.genres.join(' · ') : 'Sélection musicale';
  const price = suggestion ? (suggestion.paymentMode === 'FREE' ? `${suggestion.freePrice ?? 0} FREE` : `${(suggestion.priceCents / 100).toFixed(2).replace('.', ',')}${suggestion.currencyCode === 'EUR' ? '€' : ` ${suggestion.currencyCode}`}`) : null;
  const priceLabel = suggestion
    ? suggestion.paymentMode === 'FREE'
      ? `${suggestion.freePrice ?? 0} FREE`
      : `${(suggestion.priceCents / 100).toFixed(2).replace('.', ',')}${suggestion.currencyCode === 'EUR' ? '€' : ` ${suggestion.currencyCode}`}`
    : null;
  const price = suggestion ? (suggestion.paymentMode === 'FREE' ? `${suggestion.freePrice ?? 0} FREE` : `${(suggestion.priceCents / 100).toFixed(2).replace('.', ',')}${suggestion.currencyCode === 'EUR' ? '€' : ` ${suggestion.currencyCode}`}`) : null;
  const price = suggestion ? (suggestion.paymentMode === 'FREE' ? `${suggestion.freePrice ?? 0} FREE` : `${(suggestion.priceCents / 100).toFixed(2).replace('.', ',')}${suggestion.currencyCode === 'EUR' ? '€' : ` ${suggestion.currencyCode}`}`) : null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail} snapToInterval={286} decelerationRate="fast">
      <TouchableOpacity style={[s.card, s.suggestion]} onPress={onSuggestionPress} disabled={!suggestion || !onSuggestionPress} accessibilityLabel={suggestion ? `Suggestion Loki de ${suggestion.sellerUsername}` : 'Suggestions Loki en préparation'}>
        <Animated.View pointerEvents="none" style={[s.aura,{opacity:pulse.interpolate({inputRange:[0,1],outputRange:[.08,.24]}),transform:[{scale:pulse.interpolate({inputRange:[0,1],outputRange:[.8,1.2]})}]}]} /><View style={s.top}><Text style={s.kicker}>✦ À ÉCOUTER · À DÉBLOQUER</Text><Animated.View style={[s.liveDot,{transform:[{scale:pulse.interpolate({inputRange:[0,1],outputRange:[.75,1.25]})}]}]} /></View>
        {suggestion ? <View style={s.saleLine}><Text style={s.saleBadge}>SÉLECTION EXCLUSIVE</Text><Text style={s.price}>{price}</Text></View> : null}
        {suggestion ? <View style={s.personRow}>{suggestion.sellerAvatarUrl ? <Image source={{ uri: suggestion.sellerAvatarUrl }} style={s.avatar} /> : <View style={s.avatarFallback}><Text style={s.avatarLetter}>{suggestion.sellerUsername.slice(0,1).toUpperCase()}</Text></View>}<View style={s.personText}><Text style={s.title} numberOfLines={1}>{suggestion.playlistName}</Text><Text style={s.meta} numberOfLines={1}>{suggestion.sellerUsername} · {suggestion.trackCount} pépite{suggestion.trackCount > 1 ? 's' : ''}</Text></View></View> : <Text style={s.title}>Ton prochain univers arrive…</Text>}
        {suggestion ? <View style={s.ctaRow}><View style={s.listenCta}><Text style={s.listenCtaText}>▶ ÉCOUTER</Text></View><Text style={s.ctaHint}>Découvre avant de débloquer</Text></View> : null}
        <View style={s.marqueeClip}><Animated.Text numberOfLines={1} style={[s.marquee,{transform:[{translateX:drift.interpolate({inputRange:[0,1],outputRange:[0,-26]})}]}]}>{suggestion ? `${suggestion.paymentMode === 'FREE' ? `${suggestion.freePrice ?? 0} FREE` : `${(suggestion.priceCents / 100).toFixed(2).replace('.', ',')} ${suggestion.currencyCode === 'EUR' ? '€' : suggestion.currencyCode}`} · ${genres} · À DÉBLOQUER` : `${genres} · DÉCOUVRE →`}</Animated.Text></View>
        {suggestion ? <View style={s.saleActions}><TouchableOpacity style={s.listen} onPress={(event) => { event.stopPropagation?.(); (onListenPress ?? onSuggestionPress)?.(); }} accessibilityLabel="Écouter un extrait"><Text style={s.listenText}>▶ ÉCOUTER</Text></TouchableOpacity><View style={s.saleTag}><Text style={s.saleTagText}>{suggestion.paymentMode === 'FREE' ? `${suggestion.freePrice ?? 0} FREE` : `${(suggestion.priceCents / 100).toFixed(2).replace('.', ',')} ${suggestion.currencyCode === 'EUR' ? '€' : suggestion.currencyCode}`}</Text></View></View> : null}
      </TouchableOpacity>

      <TouchableOpacity style={[s.card, s.participate]} onPress={tipIndex === 0 ? onParticipatePress : tipIndex === 1 ? onParticipatePress : onOffersPress} accessibilityLabel={tip.title}>
        <Text style={s.kicker}>{tip.kicker}</Text>
        <Text style={s.title}>{tip.title}</Text>
        <Text style={s.body}>{tip.body}</Text>
        <View style={s.tipFooter}><View style={s.tipDots}>{tips.map((_, index) => <View key={index} style={[s.tipDot, index === tipIndex && s.tipDotOn]} />)}</View><Text style={s.tipCta}>EN SAVOIR PLUS →</Text></View>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s=StyleSheet.create({
  rail:{paddingHorizontal:18,paddingVertical:8,gap:10},
  card:{width:276,minHeight:132,borderRadius:18,padding:12,borderWidth:1,overflow:'hidden'},
  suggestion:{backgroundColor:colors.primaryFaint,borderColor:colors.primary},
  aura:{position:'absolute',right:-30,top:-55,width:160,height:160,borderRadius:80,backgroundColor:colors.primaryLight},
  participate:{backgroundColor:colors.backgroundElevated,borderColor:colors.border},
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
  ctaRow:{flexDirection:'row',alignItems:'center',gap:7,marginTop:7},listenCta:{paddingHorizontal:9,paddingVertical:6,borderRadius:10,backgroundColor:colors.primary},listenCtaText:{color:'#fff',fontSize:9,fontWeight:'900'},ctaHint:{flex:1,color:colors.textMuted,fontSize:8,fontWeight:'700'},marqueeClip:{overflow:'hidden',marginTop:6},
  marquee:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:.8,width:330},
  saleActions:{marginTop:8,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},listen:{minHeight:32,paddingHorizontal:11,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:colors.primary},listenText:{color:'#fff',fontSize:9,fontWeight:'900'},saleTag:{minHeight:30,paddingHorizontal:9,borderRadius:11,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.success},saleTagText:{color:colors.success,fontSize:9,fontWeight:'900'},body:{color:colors.textMuted,fontSize:9,lineHeight:12,fontWeight:'700',marginTop:5},
  tipFooter:{marginTop:9,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},tipDots:{flexDirection:'row',gap:4},tipDot:{width:5,height:5,borderRadius:3,backgroundColor:colors.border},tipDotOn:{width:13,backgroundColor:colors.primaryLight},tipCta:{color:colors.primaryLight,fontSize:8,fontWeight:'900',letterSpacing:.5},
});
