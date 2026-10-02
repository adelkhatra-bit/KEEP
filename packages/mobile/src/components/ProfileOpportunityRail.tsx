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
  // Prix manquant : ne jamais inventer un montant (ancien « 3 FREE » par défaut).
  if (suggestion.paymentMode === 'FREE') return suggestion.freePrice != null ? `${suggestion.freePrice} FREE` : 'FREE';
  return `${(suggestion.priceCents / 100).toFixed(2).replace('.', ',')}${suggestion.currencyCode === 'EUR' ? '€' : ` ${suggestion.currencyCode}`}`;
}

const DROP_MARKETING_HOOKS = [
  'Ton prochain coup de cœur peut être dans ce drop.',
  'Écoute l’aperçu, garde seulement ce qui te ressemble.',
  'Une sélection pensée pour te faire découvrir autre chose.',
  'Quelques titres, une ambiance, peut-être ta prochaine pépite.',
  'Teste le mix avant de décider : l’aperçu reste gratuit.',
  'Découvre l’univers du créateur avant de débloquer la sélection.',
];

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
  const overlapLabel = suggestion.missingCount <= 0
    ? `Tu as déjà les ${suggestion.trackCount} titres`
    : suggestion.ownedCount > 0
      ? `${suggestion.missingCount} nouveau${suggestion.missingCount > 1 ? 'x' : ''} sur ${suggestion.trackCount} · ${suggestion.ownedCount} déjà chez toi`
      : `${suggestion.trackCount} titre${suggestion.trackCount > 1 ? 's' : ''} nouveau${suggestion.trackCount > 1 ? 'x' : ''} pour toi`;
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
        <Text style={s.overlap} numberOfLines={1}>{overlapLabel}</Text>
        <Text style={s.hook} numberOfLines={2}>{DROP_MARKETING_HOOKS[index % DROP_MARKETING_HOOKS.length]}</Text>
        <View style={s.actions}>
          {suggestion.paymentMode === 'FREE' ? (
            <TouchableOpacity
              style={s.freeDropButton}
              onPress={() => onSuggestionPress(suggestion)}
              accessibilityRole="button"
              accessibilityLabel={suggestion.freePrice != null ? `Découvrir ce drop pour ${suggestion.freePrice} FREE` : 'Découvrir ce drop en FREE'}
            >
              <View style={s.freeOrbStage}>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    s.freeOrbAura,
                    { opacity: reduceMotion ? .34 : glow.interpolate({ inputRange:[0,1], outputRange:[.18,.62] }), transform:[{ scale: reduceMotion ? 1 : glow.interpolate({ inputRange:[0,1], outputRange:[.9,1.18] }) }] },
                  ]}
                />
                <Animated.View
                  pointerEvents="none"
                  style={[
                    s.freeOrb,
                    reduceMotion ? undefined : {
                      transform: [
                        { perspective: 700 },
                        { rotateY: freeFlip.interpolate({ inputRange:[0,1], outputRange:['-20deg','20deg'] }) },
                        { rotateZ: freeFlip.interpolate({ inputRange:[0,1], outputRange:['-4deg','4deg'] }) },
                        { scale: glow.interpolate({ inputRange:[0,1], outputRange:[.96,1.08] }) },
                      ],
                    },
                  ]}
                >
                  <View style={s.freeOrbInner}>
                    <Text style={s.freeOrbSpark}>✦</Text>
                    <Text style={s.freeOrbValue}>{suggestion.freePrice ?? '✦'}</Text>
                    <Text style={s.freeOrbLabel}>FREE</Text>
                  </View>
                </Animated.View>
              </View>
              <View style={s.freeDropCopy}>
                <Text style={s.freeDropTop}>{suggestion.freePrice != null ? `SEULEMENT ${suggestion.freePrice} FREE` : 'EN FREE'}</Text>
                <Text style={s.freeDropMiddle}>DÉBLOQUE LE DROP</Text>
                <Text style={s.freeDropBottom}>APERÇU GRATUIT AVANT DE CHOISIR</Text>
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
  overlap:{color:colors.keep,fontSize:10,fontWeight:'900',marginTop:4},
  hook:{color:colors.textMuted,fontSize:11,lineHeight:16,marginTop:7},
  actions:{flexDirection:'row',alignItems:'center',gap:8,marginTop:12},
  price:{minHeight:34,paddingHorizontal:10,borderRadius:17,borderWidth:1,borderColor:'#E8C26A',backgroundColor:'rgba(232,194,106,.14)',alignItems:'center',justifyContent:'center'},
  priceText:{color:'#E8C26A',fontSize:11,fontWeight:'900'},
  freeDropButton:{flex:1,minHeight:66,borderRadius:22,borderWidth:1,borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.08)',flexDirection:'row',alignItems:'center',paddingHorizontal:9,paddingVertical:7,overflow:'hidden'},
  freeOrbStage:{width:62,height:58,alignItems:'center',justifyContent:'center'},
  freeOrbAura:{position:'absolute',width:58,height:58,borderRadius:29,backgroundColor:colors.keep},
  freeOrb:{width:52,height:52,borderRadius:26,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(45,225,194,.18)',borderWidth:1,borderColor:colors.keep,shadowColor:'#2DE1C2',shadowOpacity:.72,shadowRadius:13,shadowOffset:{width:0,height:0},elevation:10},
  freeOrbInner:{width:41,height:41,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(139,92,246,.34)',borderWidth:1,borderColor:'rgba(255,255,255,.42)'},
  freeOrbSpark:{position:'absolute',right:1,top:-4,color:'#FFF',fontSize:9,fontWeight:'900'},
  freeOrbValue:{color:'#FFF',fontSize:20,lineHeight:21,fontWeight:'900'},
  freeOrbLabel:{color:colors.keep,fontSize:8,lineHeight:9,fontWeight:'900',letterSpacing:.9},
  freeDropCopy:{flex:1,minWidth:0,paddingLeft:8},
  freeDropTop:{color:colors.keep,fontSize:12,fontWeight:'900',letterSpacing:.55},
  freeDropMiddle:{color:'#FFF',fontSize:9,fontWeight:'900',letterSpacing:.75,marginTop:1},
  freeDropBottom:{color:colors.textMuted,fontSize:7.5,fontWeight:'900',letterSpacing:.35,marginTop:3},
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
