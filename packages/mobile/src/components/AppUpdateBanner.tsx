import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { reloadToLatest } from '../services/appUpdateService';
import { useAppUpdateStore } from '../store/useAppUpdateStore';
import { colors } from '../theme/colors';

/**
 * Contrat de diffusion Loki :
 * - ordinateur web : le contrôle d'actualisation reste TOUJOURS accessible ;
 * - nouvelle version détectée : il devient un bandeau de mise à jour explicite ;
 * - mobile web : pas de gros bandeau qui mange l'écran ;
 * - iOS/Android : EAS Update compatible reste appliqué silencieusement.
 */
export default function AppUpdateBanner() {
  const { width } = useWindowDimensions();
  const latestSha = useAppUpdateStore((state) => state.latestSha);
  const checkNow = useAppUpdateStore((state) => state.checkNow);
  const dismiss = useAppUpdateStore((state) => state.dismiss);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    void checkNow();
    const interval = setInterval(() => { void checkNow(); }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [checkNow]);

  useEffect(() => {
    if (Platform.OS === 'web' || __DEV__) return undefined;

    let active = true;
    const applySilently = async () => {
      try {
        const Updates = await import('expo-updates');
        if (!active || !Updates.isEnabled) return;
        const check = await Updates.checkForUpdateAsync();
        if (!active || !check.isAvailable) return;
        await Updates.fetchUpdateAsync();
        if (!active) return;
        await Updates.reloadAsync();
      } catch {
        // Une panne OTA ne doit jamais bloquer la version installée.
      }
    };

    void applySilently();
    return () => { active = false; };
  }, []);

  if (Platform.OS !== 'web' || width < 768) return null;

  const refresh = () => {
    if (busy) return;
    setBusy(true);
    // Toujours vérifier une dernière fois puis recharger le vrai bundle avec
    // cache-bust. Ce bouton reste utile même si version.json n'a pas encore
    // signalé de différence.
    void checkNow().finally(reloadToLatest);
  };

  return (
    <View testID="keep-manual-update-control" style={s.wrap} pointerEvents="box-none">
      <View style={[s.card, latestSha ? s.cardUpdate : null]}>
        <View style={s.copy}>
          <Text style={s.kicker}>{latestSha ? 'NOUVELLE VERSION DISPONIBLE' : 'ACTUALISER LOKI MUSIC'}</Text>
          <Text style={s.text}>{latestSha ? 'Les dernières corrections sont prêtes.' : 'Recharge si tu veux vérifier le tout dernier visuel.'}</Text>
        </View>
        <TouchableOpacity
          style={[s.action, busy && s.disabled]}
          onPress={refresh}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={latestSha ? 'Mettre à jour Loki Music' : 'Actualiser Loki Music'}
        >
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.actionText}>{latestSha ? 'METTRE À JOUR' : 'ACTUALISER'}</Text>}
        </TouchableOpacity>
        {latestSha ? (
          <TouchableOpacity style={s.later} onPress={dismiss} disabled={busy} accessibilityRole="button" accessibilityLabel="Faire la mise à jour plus tard">
            <Text style={s.laterText}>PLUS TARD</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const s=StyleSheet.create({
  wrap:{position:'absolute',right:14,top:14,zIndex:9999,width:340,maxWidth:'calc(100% - 28px)' as any},
  card:{width:340,minHeight:68,maxWidth:'100%',borderRadius:16,borderWidth:1,borderColor:colors.border,backgroundColor:'rgba(17,12,27,.96)',paddingHorizontal:12,paddingVertical:9,flexDirection:'row',alignItems:'center',gap:9,shadowColor:'#000',shadowOpacity:.32,shadowRadius:14,shadowOffset:{width:0,height:7},elevation:32},
  cardUpdate:{borderColor:colors.primaryLight,backgroundColor:'rgba(25,17,40,.98)'},
  copy:{flex:1,minWidth:0},
  kicker:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:.7},
  text:{color:colors.textMutedGrey,fontSize:10.5,lineHeight:14,marginTop:3},
  action:{minWidth:82,minHeight:38,borderRadius:12,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',paddingHorizontal:9},
  actionText:{color:'#FFF',fontSize:9,fontWeight:'900'},
  later:{position:'absolute',right:8,bottom:-25,minHeight:24,paddingHorizontal:8,justifyContent:'center'},
  laterText:{color:colors.textMutedGrey,fontSize:8.5,fontWeight:'800'},
  disabled:{opacity:.55},
});
