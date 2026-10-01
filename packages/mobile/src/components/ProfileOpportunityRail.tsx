import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme/colors';
import type { ProfileSaleSuggestion } from '../services/profileSaleSuggestionService';

type Props = {
  suggestions?: ProfileSaleSuggestion[];
  viewerKey?: string;
  onSuggestionPress: (suggestion: ProfileSaleSuggestion) => void;
};

function priceLabel(suggestion: ProfileSaleSuggestion): string {
  if (suggestion.paymentMode === 'FREE') return `${suggestion.freePrice ?? 0} FREE`;
  return `${(suggestion.priceCents / 100).toFixed(2).replace('.', ',')}${suggestion.currencyCode === 'EUR' ? '€' : ` ${suggestion.currencyCode}`}`;
}

export default function ProfileOpportunityRail({ suggestions = [], viewerKey = 'guest', onSuggestionPress }: Props) {
  const storageKey = `keep:profile-opportunity-rail:${viewerKey}`;
  const [visible, setVisible] = useState(true);
  const [index, setIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const dance = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const freeFlip = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(storageKey).then((value) => { if (live) setVisible(value !== 'hidden'); }).catch(() => {});
    AccessibilityInfo.isReduceMotionEnabled?.().then((value) => { if (live) setReduceMotion(Boolean(value)); }).catch(() => {});
    return () => { live = false; };
  }, [storageKey]);

  useEffect(() => {
    if (!suggestions.length) return;
    setIndex((current) => current % suggestions.length);
    const newestOfferId = suggestions[0]?.offerId;
    if (!newestOfferId) return;
    const latestKey = `${storageKey}:latest-offer`;
    AsyncStorage.getItem(latestKey).then((previousOfferId) => {
      if (previousOfferId && previousOfferId !== newestOfferId) {
        setVisible(true);
        void AsyncStorage.setItem(storageKey, 'visible');
      }
      void AsyncStorage.setItem(latestKey, newestOfferId);
    }).catch(() => {});
  }, [storageKey, suggestions]);

  useEffect(() => {
    if (!visible || suggestions.length < 2) return undefined;
    const timer = setInterval(() => setIndex((current) => (current + 1) % suggestions.length), 5200);
    return () => clearInterval(timer);
  }, [visible, suggestions.length]);

  useEffect(() => {
    dance.stopAnimation();
    glow.stopAnimation();
    freeFlip.stopAnimation();
    if (!visible || reduceMotion || !suggestions.length) {
      dance.setValue(0);
      glow.setValue(0);
      freeFlip.setValue(0);
      return undefined;
    }
    const danceLoop = Animated.loop(Animated.sequence([
      Animated.timing(dance, { toValue: 1, duration: 620, useNativeDriver: true }),
      Animated.timing(dance, { toValue: 0, duration: 620, useNativeDriver: true }),
    ]));
    const glowLoop = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1100, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 1100, useNativeDriver: true }),
    ]));
    danceLoop.start();
    const freeFlipLoop = Animated.loop(Animated.sequence([
      Animated.timing(freeFlip, { toValue: 1, duration: 1600, useNativeDriver: true }),
      Animated.timing(freeFlip, { toValue: 0, duration: 1600, useNativeDriver: true }),
    ]));
    glowLoop.start();
    freeFlipLoop.start();
    return () => { danceLoop.stop(); glowLoop.stop(); freeFlipLoop.stop(); };
  }, [dance, freeFlip, glow, reduceMotion, suggestions.length, visible]);

  if (!suggestions.length) return null;
  const suggestion = suggestions[index % suggestions.length];
  const genre = suggestion.genres?.[0] || 'Mix';
  const hide = () => { setVisible(false); void AsyncStorage.setItem(storageKey, 'hidden'); };
  const show = () => { setVisible(true); void AsyncStorage.setItem(storageKey, 'visible'); };

  if (!visible) {
    return <TouchableOpacity style={s.reopen} onPress={show} accessibilityRole="button" accessibilityLabel="Afficher le drop musical du moment">
      <Text style={s.reopenIcon}>◆</Text>
      <View style={s.reopenCopy}><Text style={s.reopenTitle}>DROP DU MOMENT</Text><Text style={s.reopenMeta}>Une nouvelle sélection t’attend</Text></View>
      <Text style={s.reopenArrow}>›</Text>
    </TouchableOpacity>;
  }

  return <View style={s.wrapper}>
    <View style={s.hero}>
      <Animated.View pointerEvents="none" style={[s.glow,{opacity:glow.interpolate({inputRange:[0,1],outputRange:[.16,.5]}),transform:[{scale:glow.interpolate({inputRange:[0,1],outputRange:[.9,1.1]})}]}]} />
      <View style={s.stage}>
        <Animated.Text
          accessible={false}
          style={[s.dancer, reduceMotion ? undefined : { transform: [
            { translateY: dance.interpolate({ inputRange:[0,1], outputRange:[4,-7] }) },
            { rotate: dance.interpolate({ inputRange:[0,1], outputRange:['-7deg','8deg'] }) },
            { scale: dance.interpolate({ inputRange:[0,1], outputRange:[.98,1.06] }) },
          ] }]}
        >🕺</Animated.Text>
        <View style={s.wave}>
          {[16,28,42,24,52,34,20].map((height, waveIndex) => <Animated.View key={waveIndex} style={[s.waveBar,{height,opacity:reduceMotion ? .55 : glow.interpolate({inputRange:[0,1],outputRange:[.35,.95]})}]} />)}
        </View>
      </View>

      <View style={s.copy}>
        <View style={s.kickerRow}><Text style={s.kicker}>DROP DU MOMENT</Text><Text style={s.position}>{index + 1}/{suggestions.length}</Text></View>
        <Text style={s.title} numberOfLines={1}>{suggestion.playlistName || 'Nouveau mix'}</Text>
        <Text style={s.meta} numberOfLines={1}>@{suggestion.sellerUsername} · {suggestion.trackCount} titres · {genre}</Text>
        <Text style={s.hook} numberOfLines={2}>Entre dans le mix. Les titres restent secrets pendant l’aperçu.</Text>
        <View style={s.actions}>
          {suggestion.paymentMode === 'FREE' ? (
            <TouchableOpacity
              style={s.freeDropButton}
              onPress={() => onSuggestionPress(suggestion)}
              accessibilityRole="button"
              accessibilityLabel={`Découvrir ce drop pour ${suggestion.freePrice ?? 3} FREE`}
            >
              <Animated.View
                pointerEvents="none"
                style={[
                  s.freeOrb,
                  reduceMotion ? undefined : {
                    transform: [
                      { perspective: 700 },
                      { rotateY: freeFlip.interpolate({ inputRange:[0,1], outputRange:['-18deg','18deg'] }) },
                      { rotateZ: freeFlip.interpolate({ inputRange:[0,1], outputRange:['-3deg','3deg'] }) },
                      { scale: glow.interpolate({ inputRange:[0,1], outputRange:[.96,1.07] }) },
                    ],
                  },
                ]}
              >
                <View style={s.freeOrbInner}>
                  <Text style={s.freeOrbSpark}>✦</Text>
                  <Text style={s.freeOrbValue}>{suggestion.freePrice ?? 3}</Text>
                  <Text style={s.freeOrbLabel}>FREE</Text>
                </View>
              </Animated.View>
              <View style={s.freeDropCopy}>
                <Text style={s.freeDropTop}>SURPRISE À DÉBLOQUER</Text>
                <Text style={s.freeDropBottom}>TOUCHE POUR L’APERÇU</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <>
              <View style={s.price}><Text style={s.priceText}>{priceLabel(suggestion)}</Text></View>
              <TouchableOpacity style={s.listen} onPress={() => onSuggestionPress(suggestion)} accessibilityLabel={`Lancer l'aperçu de ${suggestion.playlistName}`}><Text style={s.listenText}>▶ APERÇU</Text></TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>

    <View style={s.footer}>
      <View style={s.dots}>{suggestions.slice(0,8).map((row,dotIndex)=><TouchableOpacity key={row.offerId} onPress={()=>setIndex(dotIndex)} accessibilityLabel={`Afficher le drop ${dotIndex+1}`} style={[s.dot,dotIndex===index&&s.dotOn]} />)}</View>
      <TouchableOpacity onPress={hide} accessibilityLabel="Masquer le drop musical"><Text style={s.hideText}>MASQUER</Text></TouchableOpacity>
    </View>
  </View>;
}

const s=StyleSheet.create({
  wrapper:{marginHorizontal:18,marginTop:12,marginBottom:6},
  hero:{minHeight:180,borderRadius:24,borderWidth:1,borderColor:colors.primary,backgroundColor:colors.backgroundElevated,overflow:'hidden',flexDirection:'row',alignItems:'stretch',padding:14},
  glow:{position:'absolute',left:-28,top:-18,width:170,height:170,borderRadius:85,backgroundColor:colors.primary},
  stage:{width:104,alignItems:'center',justifyContent:'center',position:'relative'},
  dancer:{fontSize:54,zIndex:2},
  wave:{position:'absolute',left:4,right:4,bottom:10,height:56,flexDirection:'row',alignItems:'flex-end',justifyContent:'center',gap:4},
  waveBar:{width:5,borderRadius:3,backgroundColor:colors.keep},
  copy:{flex:1,minWidth:0,justifyContent:'center',paddingLeft:10},
  kickerRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  kicker:{color:colors.keep,fontSize:9,fontWeight:'900',letterSpacing:1.2},
  position:{color:colors.textMuted,fontSize:9,fontWeight:'800'},
  title:{color:colors.textPrimary,fontSize:19,fontWeight:'900',marginTop:5},
  meta:{color:colors.primaryLight,fontSize:11,fontWeight:'800',marginTop:4},
  hook:{color:colors.textMuted,fontSize:11,lineHeight:16,marginTop:7},
  actions:{flexDirection:'row',alignItems:'center',gap:8,marginTop:12},
  price:{minHeight:34,paddingHorizontal:10,borderRadius:17,borderWidth:1,borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.10)',alignItems:'center',justifyContent:'center'},
  priceText:{color:colors.keep,fontSize:11,fontWeight:'900'},
  freeDropButton:{flex:1,minHeight:54,borderRadius:20,borderWidth:1,borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.08)',flexDirection:'row',alignItems:'center',paddingHorizontal:8,paddingVertical:6,overflow:'hidden'},
  freeOrb:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(45,225,194,.18)',borderWidth:1,borderColor:colors.keep,shadowColor:'#2DE1C2',shadowOpacity:.6,shadowRadius:10,shadowOffset:{width:0,height:0},elevation:8},
  freeOrbInner:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(139,92,246,.30)',borderWidth:1,borderColor:'rgba(255,255,255,.35)'},
  freeOrbSpark:{position:'absolute',right:1,top:-4,color:'#FFF',fontSize:9,fontWeight:'900'},
  freeOrbValue:{color:'#FFF',fontSize:16,lineHeight:17,fontWeight:'1000'},
  freeOrbLabel:{color:colors.keep,fontSize:7,lineHeight:8,fontWeight:'1000',letterSpacing:.8},
  freeDropCopy:{flex:1,minWidth:0,paddingLeft:9},
  freeDropTop:{color:'#FFF',fontSize:10,fontWeight:'1000',letterSpacing:.45},
  freeDropBottom:{color:colors.keep,fontSize:8,fontWeight:'900',letterSpacing:.55,marginTop:2},
  listen:{flex:1,minHeight:38,borderRadius:19,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',paddingHorizontal:10},
  listenText:{color:colors.white,fontSize:11,fontWeight:'900',letterSpacing:.4},
  footer:{minHeight:36,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:4},
  dots:{flexDirection:'row',alignItems:'center',gap:5},
  dot:{width:6,height:6,borderRadius:3,backgroundColor:colors.border},
  dotOn:{width:16,backgroundColor:colors.primaryLight},
  hideText:{color:colors.textMuted,fontSize:9,fontWeight:'900'},
  reopen:{marginHorizontal:18,marginVertical:10,minHeight:58,paddingHorizontal:14,borderRadius:18,borderWidth:1,borderColor:colors.primary,backgroundColor:colors.backgroundElevated,flexDirection:'row',alignItems:'center',gap:10},
  reopenIcon:{color:colors.keep,fontSize:18,fontWeight:'900'},
  reopenCopy:{flex:1,minWidth:0},
  reopenTitle:{color:colors.textPrimary,fontSize:11,fontWeight:'900',letterSpacing:.7},
  reopenMeta:{color:colors.textMuted,fontSize:10,marginTop:2},
  reopenArrow:{color:colors.primaryLight,fontSize:22,fontWeight:'900'},
});
