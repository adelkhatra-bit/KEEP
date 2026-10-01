import React, { useEffect } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { reloadToLatest } from '../services/appUpdateService';
import { useAppUpdateStore } from '../store/useAppUpdateStore';
import { colors } from '../theme/colors';

/**
 * Mise à jour Loki Music.
 *
 * - Web desktop : garde TOUJOURS un contrôle manuel visible pour éviter qu'un
 *   poste reste bloqué sur un ancien bundle/cache.
 * - Web : surveille version.json chaque minute et affiche une alerte quand un
 *   SHA plus récent est réellement publié. L'utilisateur peut actualiser ou
 *   choisir "Plus tard".
 * - Native/TestFlight : applique silencieusement une OTA EAS compatible au
 *   lancement. Aucun faux bouton Store n'est affiché.
 */
export default function AppUpdateBanner() {
  const latestSha = useAppUpdateStore((state) => state.latestSha);
  const checkNow = useAppUpdateStore((state) => state.checkNow);
  const dismiss = useAppUpdateStore((state) => state.dismiss);
  const { width } = useWindowDimensions();
  const desktopManualVisible = Platform.OS === 'web' && width >= 768;

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    void checkNow();
    const interval = setInterval(() => { void checkNow(); }, 60_000);
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
        // Une panne OTA ne doit jamais empêcher Loki Music de démarrer.
      }
    };

    void applySilently();
    return () => { active = false; };
  }, []);

  if (Platform.OS !== 'web') return null;

  const refreshNow = async () => {
    await checkNow().catch(() => {});
    reloadToLatest();
  };

  if (latestSha) {
    return (
      <View testID="keep-update-banner" style={s.banner} accessibilityRole="alert">
        <View style={s.copy}>
          <Text style={s.kicker}>NOUVELLE VERSION DISPONIBLE</Text>
          <Text style={s.title}>Loki Music vient d’être mis à jour</Text>
          <Text style={s.hint}>Recharge la version publiée sans perdre ta session.</Text>
        </View>
        <View style={s.actions}>
          <TouchableOpacity testID="keep-manual-update-control" style={s.primary} onPress={() => void refreshNow()} accessibilityRole="button" accessibilityLabel="Mettre à jour Loki Music">
            <Text style={s.primaryText}>METTRE À JOUR</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.later} onPress={dismiss} accessibilityRole="button" accessibilityLabel="Faire la mise à jour plus tard">
            <Text style={s.laterText}>PLUS TARD</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!desktopManualVisible) return null;

  return (
    <TouchableOpacity
      testID="keep-manual-update-control"
      style={s.manual}
      onPress={() => void refreshNow()}
      accessibilityRole="button"
      accessibilityLabel="Actualiser Loki Music"
    >
      <Text style={s.manualIcon}>↻</Text>
      <View>
        <Text style={s.manualText}>MISE À JOUR</Text>
        <Text style={s.manualHint}>Actualiser Loki Music</Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  banner:{position:'absolute',right:14,bottom:18,zIndex:5000,elevation:80,width:340,maxWidth:'92%',borderRadius:18,borderWidth:1.5,borderColor:colors.primaryLight,backgroundColor:'rgba(12,8,22,.98)',padding:14,shadowColor:'#000',shadowOpacity:.45,shadowRadius:18,shadowOffset:{width:0,height:8}},
  copy:{minWidth:0},
  kicker:{color:colors.keep,fontSize:10,fontWeight:'900',letterSpacing:1},
  title:{color:colors.textPrimary,fontSize:16,fontWeight:'900',marginTop:3},
  hint:{color:colors.textMutedGrey,fontSize:11.5,lineHeight:16,marginTop:4},
  actions:{flexDirection:'row',gap:8,marginTop:11},
  primary:{minHeight:42,flex:1,borderRadius:14,backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center',paddingHorizontal:12},
  primaryText:{color:'#FFF',fontSize:11,fontWeight:'900',letterSpacing:.5},
  later:{minHeight:42,paddingHorizontal:13,borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center'},
  laterText:{color:colors.textMutedGrey,fontSize:10,fontWeight:'900'},
  manual:{position:'absolute',right:14,bottom:16,zIndex:4900,elevation:75,minHeight:48,borderRadius:16,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:'rgba(12,8,22,.94)',paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:9,shadowColor:'#000',shadowOpacity:.3,shadowRadius:10,shadowOffset:{width:0,height:5}},
  manualIcon:{color:colors.keep,fontSize:21,fontWeight:'900'},
  manualText:{color:colors.textPrimary,fontSize:10.5,fontWeight:'900',letterSpacing:.7},
  manualHint:{color:colors.textMutedGrey,fontSize:8.5,fontWeight:'700',marginTop:1},
});
