import React, { useEffect, useRef } from 'react';
import { Animated, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import type { ProfileSaleSuggestion } from '../services/profileSaleSuggestionService';

type Props = {
  suggestion?: ProfileSaleSuggestion | null;
  onSuggestionPress?: () => void;
  onParticipatePress: () => void;
  onOffersPress: () => void;
};

export default function ProfileOpportunityRail({ suggestion, onSuggestionPress, onParticipatePress, onOffersPress }: Props) {
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    drift.setValue(0);
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(drift, { toValue: 1, duration: 4200, useNativeDriver: true }),
      Animated.timing(drift, { toValue: 0, duration: 4200, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [drift]);

  const genres = suggestion?.genres?.length ? suggestion.genres.join(' · ') : 'Sélection musicale';
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail} snapToInterval={286} decelerationRate="fast">
      <TouchableOpacity style={[s.card, s.suggestion]} onPress={onSuggestionPress} disabled={!suggestion || !onSuggestionPress} accessibilityLabel={suggestion ? `Suggestion Loki de ${suggestion.sellerUsername}` : 'Suggestions Loki en préparation'}>
        <View style={s.top}><Text style={s.kicker}>✦ POUR TON OREILLE</Text><View style={s.liveDot} /></View>
        {suggestion ? <View style={s.personRow}>{suggestion.sellerAvatarUrl ? <Image source={{ uri: suggestion.sellerAvatarUrl }} style={s.avatar} /> : <View style={s.avatarFallback}><Text style={s.avatarLetter}>{suggestion.sellerUsername.slice(0,1).toUpperCase()}</Text></View>}<View style={s.personText}><Text style={s.title} numberOfLines={1}>{suggestion.playlistName}</Text><Text style={s.meta} numberOfLines={1}>{suggestion.sellerUsername} · {suggestion.trackCount} pépite{suggestion.trackCount > 1 ? 's' : ''}</Text></View></View> : <Text style={s.title}>Ton prochain univers arrive…</Text>}
        <View style={s.marqueeClip}><Animated.Text numberOfLines={1} style={[s.marquee,{transform:[{translateX:drift.interpolate({inputRange:[0,1],outputRange:[0,-26]})}]}]}>{suggestion?.matchScore ? `MATCH GOÛTS · ${genres} · ÉCOUTE →` : `${genres} · DÉCOUVRE →`}</Animated.Text></View>
      </TouchableOpacity>

      <View style={[s.card, s.participate]}>
        <Text style={s.kicker}>◆ À TOI DE JOUER</Text>
        <Text style={s.title}>Ton oreille peut avoir de la valeur.</Text>
        <Text style={s.body}>Débloque tes sélections par une formule, ou construis ta communauté : partage, Solo, Battle et progression.</Text>
        <View style={s.actions}><TouchableOpacity style={s.primary} onPress={onParticipatePress}><Text style={s.primaryText}>MES PÉPITES</Text></TouchableOpacity><TouchableOpacity style={s.secondary} onPress={onOffersPress}><Text style={s.secondaryText}>FORMULES</Text></TouchableOpacity></View>
        <Text style={s.foot}>Communauté · sélections · revenus · événements</Text>
      </View>
    </ScrollView>
  );
}

const s=StyleSheet.create({
  rail:{paddingHorizontal:18,paddingVertical:8,gap:10},
  card:{width:276,minHeight:118,borderRadius:18,padding:12,borderWidth:1,overflow:'hidden'},
  suggestion:{backgroundColor:colors.primaryFaint,borderColor:colors.primary},
  participate:{backgroundColor:colors.backgroundElevated,borderColor:colors.border},
  top:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  kicker:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:1},
  liveDot:{width:7,height:7,borderRadius:4,backgroundColor:colors.success},
  personRow:{flexDirection:'row',alignItems:'center',gap:9,marginTop:7},
  avatar:{width:32,height:32,borderRadius:16},
  avatarFallback:{width:32,height:32,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:colors.primary},
  avatarLetter:{color:'#fff',fontSize:15,fontWeight:'900'},
  personText:{flex:1,minWidth:0},
  title:{color:colors.textPrimary,fontSize:13,fontWeight:'900',marginTop:6},
  meta:{color:colors.textMuted,fontSize:10,fontWeight:'700',marginTop:2},
  marqueeClip:{overflow:'hidden',marginTop:7},
  marquee:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:.8,width:330},
  body:{color:colors.textMuted,fontSize:9,lineHeight:12,fontWeight:'700',marginTop:5},
  actions:{flexDirection:'row',gap:7,marginTop:7},
  primary:{paddingHorizontal:10,paddingVertical:7,borderRadius:12,backgroundColor:colors.primary},
  primaryText:{color:'#fff',fontSize:9,fontWeight:'900'},
  secondary:{paddingHorizontal:10,paddingVertical:7,borderRadius:12,borderWidth:1,borderColor:colors.border},
  secondaryText:{color:colors.textPrimary,fontSize:9,fontWeight:'900'},
  foot:{color:colors.textMuted,fontSize:8,fontWeight:'800',marginTop:8},
});
