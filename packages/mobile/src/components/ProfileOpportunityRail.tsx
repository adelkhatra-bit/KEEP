import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme/colors';
import type { ProfileSaleSuggestion } from '../services/profileSaleSuggestionService';

type Props = {
  suggestions?: ProfileSaleSuggestion[];
  viewerKey?: string;
  viewerUsername?: string;
  onSuggestionPress: (suggestion: ProfileSaleSuggestion) => void;
  onOpenSeller?: (suggestion: ProfileSaleSuggestion) => void;
};

function priceLabel(suggestion: ProfileSaleSuggestion): string {
  // Prix manquant : ne jamais inventer un montant (ancien « 3 FREE » par défaut).
  const money = `${(suggestion.priceCents / 100).toFixed(2).replace('.', ',')}${suggestion.currencyCode === 'EUR' ? '€' : ` ${suggestion.currencyCode}`}`;
  if (suggestion.paymentMode === 'FREE') return suggestion.freePrice != null ? `${suggestion.freePrice} FREE` : 'FREE';
  if (suggestion.paymentMode === 'BOTH') return `${suggestion.freePrice != null ? `${suggestion.freePrice} FREE` : 'FREE'} ou ${money}`;
  return money;
}

const BOUTIQUE_MARKETING_HOOKS = [
  'Ton prochain coup de cœur peut être dans cette boutique.',
  'Écoute l’aperçu, garde seulement ce qui te ressemble.',
  'Une sélection pensée pour te faire découvrir autre chose.',
  'Quelques titres, une ambiance, peut-être ta prochaine pépite.',
  'Teste le mix avant de décider : l’aperçu reste gratuit.',
  'Découvre l’univers du créateur avant de débloquer la sélection.',
];

export default function ProfileOpportunityRail({ suggestions = [], viewerKey = 'guest', viewerUsername = '', onSuggestionPress, onOpenSeller }: Props) {
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
  const viewerName = String(viewerUsername || '').trim().replace(/^@+/, '');
  const marketingHook = viewerName
    ? `${viewerName}, ${BOUTIQUE_MARKETING_HOOKS[index % BOUTIQUE_MARKETING_HOOKS.length].replace(/^./, (char) => char.toLowerCase())}`
    : BOUTIQUE_MARKETING_HOOKS[index % BOUTIQUE_MARKETING_HOOKS.length];
  const overlapLabel = suggestion.missingCount <= 0
    ? `Tu as déjà les ${suggestion.trackCount} titres`
    : suggestion.ownedCount > 0
      ? `${suggestion.missingCount} nouveau${suggestion.missingCount > 1 ? 'x' : ''} sur ${suggestion.trackCount} · ${suggestion.ownedCount} déjà chez toi`
      : `${suggestion.trackCount} titre${suggestion.trackCount > 1 ? 's' : ''} nouveau${suggestion.trackCount > 1 ? 'x' : ''} pour toi`;
  const hide = () => { setVisible(false); void AsyncStorage.setItem(storageKey, 'hidden'); };
  const show = () => { setVisible(true); void AsyncStorage.setItem(storageKey, 'visible'); };

  if (!visible) {
    return <TouchableOpacity style={s.reopen} onPress={show} accessibilityRole="button" accessibilityLabel="Afficher la Boutique musicale recommandée pour toi">
      <Text style={s.reopenIcon}>◆</Text>
      <View style={s.reopenCopy}><Text style={s.reopenTitle}>BOUTIQUE MUSICALE</Text><Text style={s.reopenMeta}>Selon tes goûts · profils suivis ou nouvelles découvertes</Text></View>
      <Text style={s.reopenArrow}>›</Text>
    </TouchableOpacity>;
  }

  const sellerInitial = (suggestion.sellerUsername || 'L').replace(/^@+/, '').slice(0, 1).toUpperCase();

  return <View style={s.wrapper}>
    <TouchableOpacity
      activeOpacity={0.9}
      style={s.heroTouch}
      onPress={() => onSuggestionPress(suggestion)}
      accessibilityRole="button"
      accessibilityLabel={`Ouvrir la Boutique musicale de ${suggestion.sellerUsername} et écouter un aperçu`}
    >
      <View style={s.hero}>
        <Animated.View
          pointerEvents="none"
          style={[
            s.glow,
            {
              opacity: reduceMotion ? .22 : glow.interpolate({ inputRange:[0,1], outputRange:[.12,.46] }),
              transform:[{ scale: reduceMotion ? 1 : glow.interpolate({ inputRange:[0,1], outputRange:[.9,1.15] }) }],
            },
          ]}
        />

        <View style={s.playerTop}>
          <View style={s.liveBadge}><View style={s.liveDot}/><Text style={s.liveBadgeText}>BOUTIQUE MUSICALE</Text></View>
          <Text style={s.position}>{index + 1}/{suggestions.length}</Text>
        </View>

        <View style={s.playerMain}>
          <View style={s.creator}>
            {suggestion.sellerAvatarUrl
              ? <Image source={{ uri: suggestion.sellerAvatarUrl }} style={s.avatar}/>
              : <View style={[s.avatar,s.avatarFallback]}><Text style={s.avatarInitial}>{sellerInitial}</Text></View>}
            <Animated.View
              pointerEvents="none"
              style={[
                s.avatarPulse,
                {
                  opacity: reduceMotion ? .28 : glow.interpolate({ inputRange:[0,1], outputRange:[.16,.62] }),
                  transform:[{ scale: reduceMotion ? 1 : glow.interpolate({ inputRange:[0,1], outputRange:[.96,1.18] }) }],
                },
              ]}
            />
          </View>

          <View style={s.copy}>
            <Text style={s.title} numberOfLines={1}>{suggestion.playlistName || 'Nouvelle Pépite'}</Text>
            <Text style={s.meta} numberOfLines={1}>@{suggestion.sellerUsername.replace(/^@+/, '')} · {suggestion.trackCount} titres · {genre}</Text>
            <Text style={s.overlap} numberOfLines={1}>{overlapLabel}</Text>
          </View>
        </View>

        <View style={s.waveStage} accessibilityElementsHidden>
          {[16,28,42,24,52,34,20,38,18,46,27,35].map((height, waveIndex) => (
            <Animated.View
              key={waveIndex}
              style={[
                s.waveBar,
                {
                  height,
                  opacity: reduceMotion ? .52 : glow.interpolate({inputRange:[0,1],outputRange:[.3,.95]}),
                  transform: reduceMotion ? undefined : [{
                    scaleY: dance.interpolate({
                      inputRange:[0,1],
                      outputRange:[waveIndex % 2 === 0 ? .66 : .92, waveIndex % 2 === 0 ? 1.14 : .72],
                    }),
                  }],
                },
              ]}
            />
          ))}
        </View>

        <View style={s.hookRow}>
          <Text style={s.hook} numberOfLines={2}>{marketingHook}</Text>
          <View style={s.priceChip}><Text style={s.priceChipText}>{priceLabel(suggestion)}</Text></View>
        </View>

        <View style={s.listenCta}>
          <Animated.View
            style={[
              s.playOrb,
              reduceMotion ? undefined : {
                transform:[
                  { perspective:700 },
                  { rotateY: freeFlip.interpolate({ inputRange:[0,1], outputRange:['-8deg','8deg'] }) },
                  { scale: glow.interpolate({ inputRange:[0,1], outputRange:[.97,1.07] }) },
                ],
              },
            ]}
          >
            <Text style={s.playOrbText}>▶</Text>
          </Animated.View>
          <View style={s.listenCopy}>
            <Text style={s.listenTitle}>1 TAP · ÉCOUTER 15 s</Text>
            <Text style={s.listenHint}>Selon tes goûts · écoute avant FREE ou PayPal</Text>
          </View>
          <Text style={s.listenArrow}>›</Text>
        </View>

        {suggestions.length > 1 ? (
          <View style={s.progress}>
            {suggestions.slice(0,8).map((row,progressIndex)=><View key={row.offerId} style={[s.progressBar,progressIndex===index&&s.progressBarOn]} />)}
          </View>
        ) : null}
      </View>
    </TouchableOpacity>

    <View style={s.footerActions}>
      {onOpenSeller ? (
        <TouchableOpacity style={s.shopButton} onPress={() => onOpenSeller(suggestion)} accessibilityRole="button" accessibilityLabel={`Voir toute la Boutique musicale de ${suggestion.sellerUsername}`}>
          <Text style={s.shopButtonText}>VOIR SA BOUTIQUE</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity style={s.hide} onPress={hide} accessibilityLabel="Masquer la Boutique musicale">
        <Text style={s.hideText}>MASQUER</Text>
      </TouchableOpacity>
    </View>
  </View>;
}

const s=StyleSheet.create({
  wrapper:{marginHorizontal:18,marginTop:12,marginBottom:6},
  heroTouch:{borderRadius:24},
  hero:{minHeight:224,borderRadius:24,borderWidth:1,borderColor:'rgba(139,92,246,.55)',backgroundColor:'#120D1B',overflow:'hidden',padding:14,position:'relative'},
  glow:{position:'absolute',right:-54,top:-62,width:210,height:210,borderRadius:105,backgroundColor:colors.primary},
  playerTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  liveBadge:{minHeight:24,paddingHorizontal:9,borderRadius:12,backgroundColor:'rgba(45,225,194,.10)',borderWidth:1,borderColor:'rgba(45,225,194,.28)',flexDirection:'row',alignItems:'center',gap:6},
  liveDot:{width:6,height:6,borderRadius:3,backgroundColor:colors.keep},
  liveBadgeText:{color:colors.keep,fontSize:9,fontWeight:'900',letterSpacing:1.1},
  position:{color:colors.textMuted,fontSize:9,fontWeight:'800'},
  playerMain:{flexDirection:'row',alignItems:'center',gap:11,marginTop:12},
  creator:{width:54,height:54,alignItems:'center',justifyContent:'center'},
  avatar:{width:48,height:48,borderRadius:24,backgroundColor:colors.backgroundCard,zIndex:2},
  avatarFallback:{alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.primaryLight},
  avatarInitial:{color:'#FFF',fontSize:20,fontWeight:'900'},
  avatarPulse:{position:'absolute',width:54,height:54,borderRadius:27,borderWidth:2,borderColor:colors.keep,zIndex:1},
  copy:{flex:1,minWidth:0},sellerLine:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:.8,marginBottom:2},
  title:{color:colors.textPrimary,fontSize:18,fontWeight:'900'},
  meta:{color:colors.primaryLight,fontSize:10,fontWeight:'800',marginTop:3},
  overlap:{color:colors.keep,fontSize:9,fontWeight:'900',marginTop:4},
  waveStage:{height:46,marginTop:10,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4,overflow:'hidden'},
  waveBar:{width:4,borderRadius:3,backgroundColor:colors.primaryLight},
  hookRow:{flexDirection:'row',alignItems:'center',gap:10,marginTop:2},
  hook:{flex:1,minWidth:0,color:colors.textMutedGrey,fontSize:10,lineHeight:14},
  priceChip:{minHeight:28,paddingHorizontal:9,borderRadius:14,borderWidth:1,borderColor:'rgba(232,194,106,.55)',backgroundColor:'rgba(232,194,106,.10)',alignItems:'center',justifyContent:'center'},
  priceChipText:{color:'#E8C26A',fontSize:10,fontWeight:'900'},
  listenCta:{minHeight:54,borderRadius:18,backgroundColor:'rgba(139,92,246,.18)',borderWidth:1,borderColor:colors.primary,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:10,marginTop:10},
  playOrb:{width:36,height:36,borderRadius:18,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',shadowColor:colors.primaryLight,shadowOpacity:.52,shadowRadius:8,shadowOffset:{width:0,height:0},elevation:7},
  playOrbText:{color:'#FFF',fontSize:13,fontWeight:'900',marginLeft:2},
  listenCopy:{flex:1,minWidth:0},
  listenTitle:{color:'#FFF',fontSize:11,fontWeight:'900',letterSpacing:.45},
  listenHint:{color:colors.textMutedGrey,fontSize:8.5,fontWeight:'700',marginTop:2},
  listenArrow:{color:colors.primaryLight,fontSize:24,fontWeight:'900'},
  progress:{height:4,flexDirection:'row',gap:4,marginTop:10},
  progressBar:{flex:1,height:3,borderRadius:2,backgroundColor:colors.border},
  progressBarOn:{backgroundColor:colors.keep},
  footerActions:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,marginTop:6},
  shopButton:{minHeight:34,paddingHorizontal:12,borderRadius:17,borderWidth:1,borderColor:colors.primary,backgroundColor:colors.primaryFaint,alignItems:'center',justifyContent:'center'},
  shopButtonText:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:.55},
  hide:{minHeight:28,justifyContent:'center',paddingHorizontal:4},
  hideText:{color:colors.textMuted,fontSize:8,fontWeight:'900',letterSpacing:.5},
  reopen:{marginHorizontal:18,marginVertical:10,minHeight:58,paddingHorizontal:14,borderRadius:18,borderWidth:1,borderColor:colors.primary,backgroundColor:colors.backgroundElevated,flexDirection:'row',alignItems:'center',gap:10},
  reopenIcon:{color:colors.keep,fontSize:18,fontWeight:'900'},
  reopenCopy:{flex:1,minWidth:0},
  reopenTitle:{color:colors.textPrimary,fontSize:11,fontWeight:'900',letterSpacing:.7},
  reopenMeta:{color:colors.textMuted,fontSize:10,marginTop:2},
  reopenArrow:{color:colors.primaryLight,fontSize:22,fontWeight:'900'},
});
