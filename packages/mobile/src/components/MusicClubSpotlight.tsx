import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';

type Props = {
  username: string;
  trackCount: number;
  ownerMode?: boolean;
  onListen?: () => void;
  onPublish?: () => void;
};

/**
 * État vide du Club musical.
 * Même emplacement que SellerBoutique : dès qu'une première Pépite est publiée,
 * le parent remplace automatiquement ce composant par le vrai Drop.
 */
export default function MusicClubSpotlight({
  username,
  trackCount,
  ownerMode = false,
  onListen,
  onPublish,
}: Props) {
  const pulse = useRef(new Animated.Value(0)).current;
  const waveA = useRef(new Animated.Value(0)).current;
  const waveB = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, useNativeDriver: true }),
      ]),
    );
    const waveLoopA = Animated.loop(
      Animated.sequence([
        Animated.timing(waveA, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(waveA, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    const waveLoopB = Animated.loop(
      Animated.sequence([
        Animated.timing(waveB, { toValue: 1, duration: 1250, useNativeDriver: true }),
        Animated.timing(waveB, { toValue: 0, duration: 1250, useNativeDriver: true }),
      ]),
    );
    pulseLoop.start();
    waveLoopA.start();
    waveLoopB.start();
    return () => {
      pulseLoop.stop();
      waveLoopA.stop();
      waveLoopB.stop();
    };
  }, [pulse, waveA, waveB]);

  const canListen = Boolean(onListen && trackCount > 0);
  const normalized = String(username || 'Loki').replace(/^@+/, '');

  return (
    <View style={s.root} accessibilityLabel={ownerMode ? 'Mon club musical' : `Club musical de ${normalized}`}>
      <LinearGradient colors={['#171021', '#2A1B47', '#11101A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
        <View style={s.topRow}>
          <View style={s.liveRow}>
            <Animated.View style={[s.liveDot, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) }]} />
            <Text style={s.kicker}>{ownerMode ? 'MON CLUB MUSICAL' : 'SON CLUB MUSICAL'}</Text>
          </View>
          <Text style={s.tag}>{ownerMode ? 'À FAIRE VIVRE' : 'À DÉCOUVRIR'}</Text>
        </View>

        <View style={s.mainRow}>
          <View style={s.copy}>
            <Text style={s.title}>{ownerMode ? 'Ton univers peut devenir un Drop.' : `Entre dans l’univers de @${normalized}`}</Text>
            <Text style={s.subtitle}>
              {trackCount > 0
                ? `${trackCount} morceau${trackCount > 1 ? 'x' : ''} à découvrir maintenant`
                : ownerMode
                  ? 'Ajoute des morceaux puis publie ta première Pépite.'
                  : 'Son univers musical se construit encore.'}
            </Text>
          </View>

          <View style={s.visual}>
            <Animated.View style={[s.ringOuter, {
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.24, 0.7] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.08] }) }],
            }]} />
            <Animated.View style={[s.ringInner, {
              transform: [{ scale: waveA.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.12] }) }],
            }]} />
            <View style={s.playCore}><Text style={s.playCoreText}>♪</Text></View>
          </View>
        </View>

        <View style={s.waveRow} pointerEvents="none">
          {[waveA, waveB, pulse, waveA, waveB, pulse, waveA].map((value, index) => (
            <Animated.View
              key={index}
              style={[s.waveBar, {
                transform: [{ scaleY: value.interpolate({ inputRange: [0, 1], outputRange: [0.38 + (index % 3) * 0.12, 1] }) }],
                opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
              }]}
            />
          ))}
        </View>

        {canListen ? (
          <TouchableOpacity style={s.listenButton} onPress={onListen} accessibilityRole="button" accessibilityLabel={ownerMode ? 'Écouter mon univers musical' : `Écouter l’univers musical de ${normalized}`}>
            <Text style={s.listenText}>▶ {ownerMode ? 'ÉCOUTER MON UNIVERS' : 'ÉCOUTER SON UNIVERS'}</Text>
            <Text style={s.listenArrow}>›</Text>
          </TouchableOpacity>
        ) : null}

        {ownerMode && onPublish ? (
          <TouchableOpacity style={s.publishButton} onPress={onPublish} accessibilityRole="button" accessibilityLabel="Publier ma première Pépite">
            <Text style={s.publishText}>◆ PUBLIER MA PREMIÈRE PÉPITE</Text>
          </TouchableOpacity>
        ) : null}

        {!ownerMode ? <Text style={s.footer}>Quand @{normalized} publiera une Pépite, elle apparaîtra ici automatiquement.</Text> : null}
      </LinearGradient>
    </View>
  );
}

const s = StyleSheet.create({
  root:{marginHorizontal:18,marginTop:14},
  card:{borderRadius:24,borderWidth:1,borderColor:colors.primary,padding:16,overflow:'hidden'},
  topRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},
  liveRow:{flexDirection:'row',alignItems:'center',gap:7},
  liveDot:{width:8,height:8,borderRadius:4,backgroundColor:colors.primaryLight},
  kicker:{color:'#FFFFFF',fontSize:10,fontWeight:'900',letterSpacing:1},
  tag:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:.7},
  mainRow:{flexDirection:'row',alignItems:'center',gap:14,marginTop:14},
  copy:{flex:1,minWidth:0},
  title:{color:'#FFFFFF',fontSize:20,lineHeight:24,fontWeight:'900'},
  subtitle:{color:'rgba(255,255,255,.75)',fontSize:11,lineHeight:16,fontWeight:'700',marginTop:6},
  visual:{width:86,height:86,alignItems:'center',justifyContent:'center'},
  ringOuter:{position:'absolute',width:82,height:82,borderRadius:41,borderWidth:1,borderColor:colors.primaryLight},
  ringInner:{position:'absolute',width:58,height:58,borderRadius:29,borderWidth:2,borderColor:'#2DE1C2'},
  playCore:{width:42,height:42,borderRadius:21,backgroundColor:'#FFFFFF',alignItems:'center',justifyContent:'center'},
  playCoreText:{color:'#171021',fontSize:21,fontWeight:'900'},
  waveRow:{height:30,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5,marginTop:6},
  waveBar:{width:5,height:26,borderRadius:3,backgroundColor:colors.primaryLight},
  listenButton:{minHeight:44,borderRadius:16,backgroundColor:'#FFFFFF',flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:14,marginTop:8},
  listenText:{color:'#171021',fontSize:11,fontWeight:'900',letterSpacing:.35},
  listenArrow:{color:'#171021',fontSize:23,fontWeight:'800'},
  publishButton:{minHeight:40,borderRadius:14,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center',marginTop:8},
  publishText:{color:'#FFFFFF',fontSize:10,fontWeight:'900'},
  footer:{color:'rgba(255,255,255,.55)',fontSize:9,lineHeight:13,textAlign:'center',marginTop:9},
});
