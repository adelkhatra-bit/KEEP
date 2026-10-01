import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { applyLatestAppUpdate } from '../services/appUpdateService';
import { useAppUpdateStore } from '../store/useAppUpdateStore';
import { colors } from '../theme/colors';

/**
 * Web : affiche explicitement « METTRE À JOUR / PLUS TARD » lorsqu'un nouveau
 * SHA GitHub Pages est réellement déployé. Le bouton applique un cache-bust
 * vers le bundle officiel, donc il ne peut pas être décoratif.
 *
 * Native : garde la mise à jour OTA EAS silencieuse au démarrage. TestFlight
 * ne doit pas afficher une bannière web ; une update compatible est chargée
 * via expo-updates puis l'app est relancée.
 */
export default function AppUpdateBanner() {
  const latestSha = useAppUpdateStore((state) => state.latestSha);
  const dismiss = useAppUpdateStore((state) => state.dismiss);
  const [applying, setApplying] = useState(false);

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
        // Une panne OTA ne doit jamais bloquer l'app déjà installée.
      }
    };

    void applySilently();
    return () => { active = false; };
  }, []);

  if (Platform.OS !== 'web' || !latestSha) return null;

  const update = async () => {
    if (applying) return;
    setApplying(true);
    const result = await applyLatestAppUpdate();
    // Sur web, RELOADING quitte immédiatement cette page. Si un navigateur
    // bloque exceptionnellement la navigation, on réactive le bouton.
    if (result !== 'RELOADING') setApplying(false);
  };

  return (
    <View style={s.wrap} pointerEvents="box-none">
      <View style={s.card} accessibilityRole="alert">
        <View style={s.copy}>
          <Text style={s.kicker}>NOUVELLE VERSION LOKI</Text>
          <Text style={s.title}>Une mise à jour est prête</Text>
          <Text style={s.body}>Recharge l’application pour voir les dernières corrections et le nouveau design.</Text>
        </View>
        <View style={s.actions}>
          <TouchableOpacity
            style={[s.primary, applying && s.disabled]}
            onPress={() => void update()}
            disabled={applying}
            accessibilityRole="button"
            accessibilityLabel="Mettre à jour Loki Music"
          >
            {applying ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.primaryText}>METTRE À JOUR</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={s.secondary}
            onPress={dismiss}
            disabled={applying}
            accessibilityRole="button"
            accessibilityLabel="Faire la mise à jour plus tard"
          >
            <Text style={s.secondaryText}>PLUS TARD</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:{position:'absolute',left:12,right:12,top:12,zIndex:9999,alignItems:'center'},
  card:{width:'100%',maxWidth:620,borderRadius:18,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:'rgba(17,12,27,.98)',padding:12,flexDirection:'row',alignItems:'center',gap:12,shadowColor:'#000',shadowOpacity:.38,shadowRadius:16,shadowOffset:{width:0,height:8},elevation:40},
  copy:{flex:1,minWidth:0},
  kicker:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:1},
  title:{color:colors.textPrimary,fontSize:15,fontWeight:'900',marginTop:2},
  body:{color:colors.textMutedGrey,fontSize:11,lineHeight:16,marginTop:3},
  actions:{gap:6,minWidth:126},
  primary:{minHeight:38,borderRadius:12,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',paddingHorizontal:10},
  primaryText:{color:'#FFFFFF',fontSize:10,fontWeight:'900'},
  secondary:{minHeight:32,borderRadius:10,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center',paddingHorizontal:10},
  secondaryText:{color:colors.textMutedGrey,fontSize:9,fontWeight:'900'},
  disabled:{opacity:.55},
});
