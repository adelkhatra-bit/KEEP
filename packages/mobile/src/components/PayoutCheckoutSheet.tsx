import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { buildPayoutCheckoutUrl, payoutProviderLabel } from '../services/payoutLinkService';
import { colors } from '../theme/colors';

type Props = {
  visible: boolean;
  sellerUsername?: string | null;
  amountCents: number;
  currencyCode: string;
  payoutLink?: string | null;
  payoutQrUrl?: string | null;
  onClose: () => void;
  onPaid?: () => Promise<void> | void;
};

export default function PayoutCheckoutSheet({
  visible,
  sellerUsername,
  amountCents,
  currencyCode,
  payoutLink,
  payoutQrUrl,
  onClose,
  onPaid,
}: Props) {
  const [busy, setBusy] = useState(false);
  const link = String(payoutLink || '').trim();
  const qr = String(payoutQrUrl || '').trim();
  const amount = useMemo(() => (Math.max(0, amountCents) / 100).toFixed(2).replace('.', ','), [amountCents]);

  const openLink = async () => {
    if (!link) return;
    const checkoutUrl = buildPayoutCheckoutUrl(link, amountCents, currencyCode);
    await Linking.openURL(checkoutUrl);
  };

  const confirmPaid = async () => {
    if (!onPaid || busy) return;
    setBusy(true);
    try {
      await onPaid();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={s.card}>
          <View style={s.header}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.eyebrow}>PAIEMENT DIRECT</Text>
              <Text style={s.title}>{amount} {String(currencyCode || 'EUR').toUpperCase()}</Text>
              <Text style={s.seller}>{sellerUsername ? `à @${String(sellerUsername).replace(/^@/, '')}` : 'au vendeur'}</Text>
            </View>
            <TouchableOpacity style={s.close} onPress={onClose} accessibilityLabel="Fermer le paiement"><Text style={s.closeText}>×</Text></TouchableOpacity>
          </View>

          <Text style={s.hint}>Loki Music ne touche pas l’argent. Choisis le moyen fourni par le vendeur, puis confirme seulement après avoir réellement payé.</Text>

          {link ? (
            <TouchableOpacity style={s.primary} onPress={() => void openLink()}>
              <Text style={s.primaryText}>OUVRIR {payoutProviderLabel(link).toUpperCase()}</Text>
            </TouchableOpacity>
          ) : null}

          {qr ? (
            <View style={s.qrBox}>
              <Text style={s.qrTitle}>QR PAYPAL DU VENDEUR</Text>
              <Image source={{ uri: qr }} style={s.qr} resizeMode="contain" />
              <Text style={s.qrHint}>Sur le même téléphone, le lien PayPal.Me reste plus pratique. Le QR sert surtout de solution de secours à scanner depuis PayPal ou un autre appareil.</Text>
            </View>
          ) : null}

          {!link && !qr ? <Text style={s.error}>Le vendeur n’a pas encore configuré son paiement.</Text> : null}

          {onPaid ? (
            <TouchableOpacity style={[s.paid, busy && s.disabled]} disabled={busy} onPress={() => void confirmPaid()}>
              {busy ? <ActivityIndicator color="#07110D" /> : <Text style={s.paidText}>J’AI PAYÉ</Text>}
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={s.later} onPress={onClose}><Text style={s.laterText}>PLUS TARD</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop:{flex:1,backgroundColor:'rgba(3,2,7,.82)',alignItems:'center',justifyContent:'center',padding:18},
  card:{width:'100%',maxWidth:380,borderRadius:24,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated,padding:16},
  header:{flexDirection:'row',alignItems:'flex-start',gap:10},
  eyebrow:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:1.1},
  title:{color:colors.textPrimary,fontSize:24,fontWeight:'900',marginTop:2},
  seller:{color:colors.keep,fontSize:12,fontWeight:'900',marginTop:2},
  close:{width:38,height:38,borderRadius:19,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center'},
  closeText:{color:colors.textPrimary,fontSize:24,lineHeight:26,fontWeight:'900'},
  hint:{color:colors.textMutedGrey,fontSize:11,lineHeight:17,marginTop:10},
  primary:{minHeight:48,borderRadius:16,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:12},
  primaryText:{color:'#FFF',fontSize:11,fontWeight:'900'},
  qrBox:{marginTop:12,borderRadius:18,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,padding:12,alignItems:'center'},
  qrTitle:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:.8},
  qr:{width:190,height:190,marginTop:9,borderRadius:14,backgroundColor:'#FFF'},
  qrHint:{color:colors.textMutedGrey,fontSize:9,lineHeight:14,textAlign:'center',marginTop:8},
  error:{color:colors.danger,fontSize:11,lineHeight:16,marginTop:12,textAlign:'center'},
  paid:{minHeight:48,borderRadius:16,backgroundColor:colors.keep,alignItems:'center',justifyContent:'center',marginTop:12},
  paidText:{color:'#07110D',fontSize:11,fontWeight:'900'},
  disabled:{opacity:.55},
  later:{minHeight:42,alignItems:'center',justifyContent:'center',marginTop:4},
  laterText:{color:colors.textMutedGrey,fontSize:10,fontWeight:'900'},
});
