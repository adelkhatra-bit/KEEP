import React, { useState } from 'react';
import { ActivityIndicator, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  const [qrFullscreen, setQrFullscreen] = useState(false);

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
          <Text style={s.hint}>Le lien PayPal.Me reste recommandé sur le même téléphone. À l’ajout du QR, tu peux le recadrer pour ne garder que le carré utile.</Text>
        </View>
        {busy ? <ActivityIndicator color={colors.primaryLight} /> : null}
      </View>
      {qrUrl ? (
        <View style={s.previewRow}>
          <TouchableOpacity onPress={() => setQrFullscreen(true)} accessibilityRole="button" accessibilityLabel="Agrandir mon QR PayPal">
            <Image source={{ uri: qrUrl }} style={s.qr} resizeMode="contain" />
            <Text style={s.qrTap}>AGRANDIR</Text>
          </TouchableOpacity>
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
      <Modal visible={qrFullscreen && Boolean(qrUrl)} transparent animationType="fade" onRequestClose={() => setQrFullscreen(false)}>
        <View style={s.qrFullscreenBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setQrFullscreen(false)} />
          <View style={s.qrFullscreenCard}>
            <TouchableOpacity style={s.qrFullscreenBack} onPress={() => setQrFullscreen(false)} accessibilityLabel="Retour au réglage QR"><Text style={s.qrFullscreenBackText}>‹ RETOUR</Text></TouchableOpacity>
            <Image source={{ uri: qrUrl }} style={s.qrFullscreenImage} resizeMode="contain" />
          </View>
        </View>
      </Modal>
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
  qrTap:{color:colors.primaryLight,fontSize:8,fontWeight:'900',textAlign:'center',marginTop:4},
  qrFullscreenBackdrop:{flex:1,backgroundColor:'rgba(3,2,7,.96)',alignItems:'center',justifyContent:'center',padding:18},
  qrFullscreenCard:{width:'100%',maxWidth:430,borderRadius:24,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated,padding:16,alignItems:'center'},
  qrFullscreenBack:{alignSelf:'flex-start',minHeight:42,justifyContent:'center'},
  qrFullscreenBackText:{color:colors.primaryLight,fontSize:11,fontWeight:'900'},
  qrFullscreenImage:{width:'100%',maxWidth:360,aspectRatio:1,marginTop:8,borderRadius:18,backgroundColor:'#FFF'},
  actions:{flex:1,gap:7},
  primary:{minHeight:42,borderRadius:13,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',paddingHorizontal:10,marginTop:10},
  primaryText:{color:'#FFF',fontSize:9,fontWeight:'900',textAlign:'center'},
  secondary:{minHeight:38,borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center',paddingHorizontal:10},
  secondaryText:{color:colors.textMutedGrey,fontSize:9,fontWeight:'900'},
});
