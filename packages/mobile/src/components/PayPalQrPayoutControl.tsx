import React, { useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { clearMyPayoutQrUrl, pickAndUploadPayoutQr } from '../services/payoutLinkService';
import { colors } from '../theme/colors';

type Props = {
  profileId: string;
  qrUrl: string;
  onChange: (url: string) => void;
  disabled?: boolean;
};

export default function PayPalQrPayoutControl({ profileId, qrUrl, onChange, disabled = false }: Props) {
  const [busy, setBusy] = useState(false);

  const choose = async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      const url = await pickAndUploadPayoutQr(profileId);
      if (url) {
        onChange(url);
        Alert.alert('QR PayPal enregistré', 'Ton QR est maintenant conservé dans ton profil Loki Music comme solution de secours au lien PayPal.Me.');
      }
    } catch (e: any) {
      Alert.alert('QR PayPal', e?.message || 'Impossible d’enregistrer cette image pour le moment.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      await clearMyPayoutQrUrl();
      onChange('');
    } catch (e: any) {
      Alert.alert('QR PayPal', e?.message || 'Impossible de retirer le QR pour le moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.box}>
      <View style={s.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.eyebrow}>QR PAYPAL · OPTIONNEL</Text>
          <Text style={s.title}>Ajoute ton QR en secours</Text>
          <Text style={s.hint}>Le lien PayPal.Me reste recommandé sur le même téléphone. Le QR sert de solution visuelle complémentaire.</Text>
        </View>
        {busy ? <ActivityIndicator color={colors.primaryLight} /> : null}
      </View>
      {qrUrl ? (
        <View style={s.previewRow}>
          <Image source={{ uri: qrUrl }} style={s.qr} resizeMode="contain" />
          <View style={s.actions}>
            <TouchableOpacity style={s.primary} disabled={busy || disabled} onPress={() => void choose()}>
              <Text style={s.primaryText}>REMPLACER LE QR</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.secondary} disabled={busy || disabled} onPress={() => void remove()}>
              <Text style={s.secondaryText}>RETIRER</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={s.primary} disabled={busy || disabled} onPress={() => void choose()}>
          <Text style={s.primaryText}>AJOUTER UNE IMAGE DE MON QR PAYPAL</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  box:{borderRadius:16,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,padding:11,marginTop:9},
  header:{flexDirection:'row',alignItems:'flex-start',gap:8},
  eyebrow:{color:colors.primaryLight,fontSize:8,fontWeight:'900',letterSpacing:.9},
  title:{color:colors.textPrimary,fontSize:13,fontWeight:'900',marginTop:3},
  hint:{color:colors.textMutedGrey,fontSize:9.5,lineHeight:14,marginTop:4},
  previewRow:{flexDirection:'row',alignItems:'center',gap:10,marginTop:10},
  qr:{width:88,height:88,borderRadius:12,backgroundColor:'#FFF'},
  actions:{flex:1,gap:7},
  primary:{minHeight:42,borderRadius:13,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',paddingHorizontal:10,marginTop:10},
  primaryText:{color:'#FFF',fontSize:9,fontWeight:'900',textAlign:'center'},
  secondary:{minHeight:38,borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center',paddingHorizontal:10},
  secondaryText:{color:colors.textMutedGrey,fontSize:9,fontWeight:'900'},
});
