import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { buildPayoutCheckoutUrl, payoutProviderLabel } from '../services/payoutLinkService';
import { loadPlaylistPaymentProof, pickAndUploadPlaylistPaymentProof, PlaylistPaymentProof } from '../services/playlistPaymentProofService';
import { colors } from '../theme/colors';
import { Alert } from '../utils/keepAlert';
import KeepModal from './KeepModal';
import { lokiText } from '../theme/lokiText';


type Props = {
  visible: boolean;
  paymentId?: string;
  sellerUsername?: string | null;
  amountCents: number;
  currencyCode: string;
  payoutLink?: string | null;
  payoutQrUrl?: string | null;
  onClose: () => void;
  onPaid?: () => Promise<void> | void;
  onCancelTransaction?: () => Promise<void> | void;
};

export default function PayoutCheckoutSheet({
  visible,
  paymentId,
  sellerUsername,
  amountCents,
  currencyCode,
  payoutLink,
  payoutQrUrl,
  onClose,
  onPaid,
  onCancelTransaction,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [proofBusy, setProofBusy] = useState(false);
  const [proof, setProof] = useState<PlaylistPaymentProof | null>(null);
  const [qrFullscreen, setQrFullscreen] = useState(false);
  const [qrHelpOpen, setQrHelpOpen] = useState(false);
  const [error, setError] = useState('');
  const link = String(payoutLink || '').trim();
  const qr = String(payoutQrUrl || '').trim();
  const amount = useMemo(() => (Math.max(0, amountCents) / 100).toFixed(2).replace('.', ','), [amountCents]);

  useEffect(() => {
    let live = true;
    setError('');
    if (!visible) {
      setQrFullscreen(false);
      setQrHelpOpen(false);
    }
    if (!visible || !paymentId) {
      setProof(null);
      return () => { live = false; };
    }
    loadPlaylistPaymentProof(paymentId)
      .then((value) => { if (live) setProof(value); })
      .catch(() => { if (live) setProof(null); });
    return () => { live = false; };
  }, [visible, paymentId]);

  const openLink = async () => {
    if (!link) return;
    const checkoutUrl = buildPayoutCheckoutUrl(link, amountCents, currencyCode);
    await Linking.openURL(checkoutUrl);
  };

  const attachProof = async (source: 'PHOTO' | 'DOCUMENT') => {
    if (!paymentId || proofBusy || busy) {
      if (!paymentId) setError('Référence de paiement manquante. Ferme puis rouvre le paiement.');
      return;
    }
    setProofBusy(true);
    setError('');
    try {
      const uploaded = await pickAndUploadPlaylistPaymentProof(paymentId, source);
      if (uploaded) setProof(uploaded);
    } catch (e: any) {
      setError(e?.message || 'Impossible de joindre cette preuve.');
    } finally {
      setProofBusy(false);
    }
  };

  const confirmCancelTransaction = () => {
    if (!onCancelTransaction || busy || proofBusy) return;
    Alert.alert(
      'Annuler la transaction ?',
      'Cette action préviendra immédiatement l’autre utilisateur qu’il ne doit plus attendre. Si un paiement a déjà été signalé ou une preuve a été jointe, Loki bloquera l’annulation.',
      [
        { text: 'GARDER LA TRANSACTION', style: 'cancel' },
        {
          text: 'ANNULER LA TRANSACTION',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            setError('');
            void Promise.resolve(onCancelTransaction())
              .then(() => onClose())
              .catch((e: any) => {
                const message = String(e?.message || '');
                setError(
                  message.includes('PAYMENT_ALREADY_REPORTED')
                    ? 'Le paiement a déjà été signalé ou une preuve a été jointe. La transaction ne peut plus être annulée silencieusement.'
                    : 'Impossible d’annuler cette transaction pour le moment.',
                );
              })
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  };

    const confirmPaid = async () => {
    if (!onPaid || busy) return;
    if (!proof) {
      setError('Ajoute d’abord une capture PayPal ou un PDF. Le vendeur pourra la consulter avant de confirmer la réception des fonds.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onPaid();
      onClose();
    } catch (e: any) {
      const message = String(e?.message || '');
      setError(message.includes('PAYMENT_PROOF_REQUIRED')
        ? 'La preuve de paiement est obligatoire avant l’envoi au vendeur.'
        : 'Impossible de signaler le paiement pour le moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <KeepModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={s.card}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={s.header}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.eyebrow}>PAIEMENT DIRECT</Text>
                <Text style={s.title}>{amount} {String(currencyCode || 'EUR').toUpperCase()}</Text>
                <Text style={s.seller}>{sellerUsername ? `à @${String(sellerUsername).replace(/^@/, '')}` : 'au vendeur'}</Text>
              </View>
              <TouchableOpacity style={s.close} onPress={onClose} accessibilityLabel="Fermer le paiement"><Text style={s.closeText}>×</Text></TouchableOpacity>
            </View>

            <Text style={s.hint}>Loki Music ne touche pas l’argent. Paie directement le vendeur, puis joins une preuve. Le vendeur devra vérifier son propre compte PayPal avant de débloquer la Pépite.</Text>

            {link ? (
              <TouchableOpacity style={s.primary} onPress={() => void openLink()}>
                <Text style={s.primaryText}>OUVRIR {payoutProviderLabel(link).toUpperCase()}</Text>
              </TouchableOpacity>
            ) : null}

            {qr ? (
              <View style={s.qrBox}>
                <Text style={s.qrTitle}>QR PAYPAL DU VENDEUR</Text>
                <TouchableOpacity onPress={() => setQrFullscreen(true)} accessibilityRole="button" accessibilityLabel="Agrandir le QR PayPal en plein écran">
                  <Image source={{ uri: qr }} style={s.qr} resizeMode="contain" />
                </TouchableOpacity>
                <Text style={s.qrTap}>TOUCHER LE QR POUR L’AGRANDIR</Text>
                <TouchableOpacity
                  style={s.qrHelpToggle}
                  onPress={() => setQrHelpOpen((value) => !value)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: qrHelpOpen }}
                  accessibilityLabel="En savoir plus sur l’utilisation du QR PayPal"
                >
                  <Text style={s.qrHelpToggleText}>INTÉGRATION PAYPAL · {qrHelpOpen ? 'MASQUER' : 'EN SAVOIR PLUS'} {qrHelpOpen ? '˄' : '˅'}</Text>
                </TouchableOpacity>
                {qrHelpOpen ? (
                  <View style={s.qrHelpBox}>
                    <Text style={s.qrHelpText}>Sur mobile, tu peux rester appuyé sur le QR pour afficher les actions proposées par ton téléphone et l’ouvrir ou le partager vers PayPal quand cette option est disponible.</Text>
                    <Text style={s.qrHelpText}>Sinon, agrandis-le puis scanne-le depuis un autre appareil. Après paiement, reviens ici et joins ta preuve.</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {!link && !qr ? <Text style={s.error}>Le vendeur n’a pas encore configuré son paiement.</Text> : null}

            {onPaid ? (
              <View style={s.proofBox}>
                <Text style={s.proofEyebrow}>PREUVE DE PAIEMENT</Text>
                <Text style={s.proofHint}>Capture PayPal ou PDF · 10 Mo maximum · visible uniquement par toi et le vendeur.</Text>
                {proof ? <Text style={s.proofReadyText}>✓ {proof.name}</Text> : null}
                <View style={s.proofActions}>
                  <TouchableOpacity style={[s.proofButton, proof && s.proofButtonReady, (proofBusy || busy || !paymentId) && s.disabled]} disabled={proofBusy || busy || !paymentId} onPress={() => void attachProof('PHOTO')}>
                    {proofBusy ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={s.proofButtonText}>{proof ? 'REMPLACER PAR UNE PHOTO' : 'CAPTURE / PHOTO'}</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.proofButton, (proofBusy || busy || !paymentId) && s.disabled]} disabled={proofBusy || busy || !paymentId} onPress={() => void attachProof('DOCUMENT')}>
                    <Text style={s.proofButtonText}>PDF / DOCUMENT</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {error ? <Text style={s.error}>{error}</Text> : null}

            {onPaid ? (
              <TouchableOpacity style={[s.paid, (!proof || busy || proofBusy) && s.disabled]} disabled={!proof || busy || proofBusy} onPress={() => void confirmPaid()}>
                {busy ? <ActivityIndicator color="#07110D" /> : <Text style={s.paidText}>J’AI PAYÉ · ENVOYER AU VENDEUR</Text>}
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={s.later} onPress={onClose}><Text style={s.laterText}>PLUS TARD</Text></TouchableOpacity>
            {onCancelTransaction ? (
              <TouchableOpacity style={s.cancelTransaction} disabled={busy || proofBusy} onPress={confirmCancelTransaction} accessibilityRole="button" accessibilityLabel="Annuler définitivement cette transaction">
                <Text style={s.cancelTransactionText}>ANNULER LA TRANSACTION</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </KeepModal>
    <KeepModal visible={qrFullscreen && Boolean(qr)} transparent animationType="fade" onRequestClose={() => setQrFullscreen(false)}>
      <View style={s.qrFullscreenBackdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setQrFullscreen(false)} />
        <View style={s.qrFullscreenCard}>
          <TouchableOpacity style={s.qrFullscreenBack} onPress={() => setQrFullscreen(false)} accessibilityRole="button" accessibilityLabel="Retour au paiement">
            <Text style={s.qrFullscreenBackText}>‹ RETOUR</Text>
          </TouchableOpacity>
          <Text style={s.qrFullscreenTitle}>QR PAYPAL</Text>
          <Image source={{ uri: qr }} style={s.qrFullscreenImage} resizeMode="contain" />
          <Text style={s.qrFullscreenHint}>Reste appuyé sur le QR pour utiliser les actions de ton téléphone vers PayPal, ou scanne-le depuis un autre appareil. Aucun titre de musique n’est affiché ici.</Text>
        </View>
      </View>
    </KeepModal>
    </>
  );
}

const s = StyleSheet.create({
  backdrop:{flex:1,backgroundColor:'rgba(3,2,7,.82)',alignItems:'center',justifyContent:'center',padding:18},
  card:{width:'100%',maxWidth:380,maxHeight:'92%',borderRadius:24,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated,overflow:'hidden'},
  scrollContent:{padding:16,paddingBottom:18},
  header:{flexDirection:'row',alignItems:'flex-start',gap:10},
  eyebrow:{color:colors.primaryLight,fontSize:lokiText.label.fontSize,fontWeight:'900',letterSpacing:1.1},
  title:{color:colors.textPrimary,fontSize:24,fontWeight:'900',marginTop:2},
  seller:{color:colors.keep,fontSize:12,fontWeight:'900',marginTop:2},
  close:{width:38,height:38,borderRadius:19,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center'},
  closeText:{color:colors.textPrimary,fontSize:24,lineHeight:26,fontWeight:'900'},
  hint:{color:colors.textMutedGrey,fontSize:11,lineHeight:17,marginTop:10},
  primary:{minHeight:48,borderRadius:16,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:12},
  primaryText:{color:'#FFF',fontSize:11,fontWeight:'900'},
  qrBox:{marginTop:12,borderRadius:18,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,padding:12,alignItems:'center'},
  qrTitle:{color:colors.primaryLight,fontSize:lokiText.label.fontSize,fontWeight:'900',letterSpacing:.8},
  qr:{width:190,height:190,marginTop:9,borderRadius:14,backgroundColor:'#FFF'},
  qrTap:{color:colors.primaryLight,fontSize:lokiText.label.fontSize,fontWeight:'900',letterSpacing:.7,marginTop:7},
  qrHint:{color:colors.textMutedGrey,fontSize:lokiText.label.fontSize,lineHeight:14,textAlign:'center',marginTop:8},
  qrHelpToggle:{width:'100%',minHeight:34,marginTop:8,borderRadius:11,borderWidth:1,borderColor:colors.border,backgroundColor:'rgba(255,255,255,.03)',alignItems:'center',justifyContent:'center',paddingHorizontal:10},
  qrHelpToggleText:{color:colors.primaryLight,fontSize:lokiText.label.fontSize,fontWeight:'900',letterSpacing:.45,textAlign:'center'},
  qrHelpBox:{width:'100%',marginTop:7,borderRadius:12,backgroundColor:'rgba(124,92,252,.08)',paddingHorizontal:10,paddingVertical:9,gap:5},
  qrHelpText:{color:colors.textMutedGrey,fontSize:lokiText.label.fontSize,lineHeight:14,textAlign:'left'},
  qrFullscreenBackdrop:{flex:1,backgroundColor:'rgba(3,2,7,.96)',alignItems:'center',justifyContent:'center',padding:18},
  qrFullscreenCard:{width:'100%',maxWidth:430,borderRadius:24,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated,padding:16,alignItems:'center'},
  qrFullscreenBack:{alignSelf:'flex-start',minHeight:42,justifyContent:'center',paddingHorizontal:4},
  qrFullscreenBackText:{color:colors.primaryLight,fontSize:11,fontWeight:'900'},
  qrFullscreenTitle:{color:colors.textPrimary,fontSize:15,fontWeight:'900',marginTop:4},
  qrFullscreenImage:{width:'100%',maxWidth:360,aspectRatio:1,marginTop:12,borderRadius:18,backgroundColor:'#FFF'},
  qrFullscreenHint:{color:colors.textMutedGrey,fontSize:lokiText.label.fontSize,lineHeight:15,textAlign:'center',marginTop:10},
  proofBox:{marginTop:12,borderRadius:18,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,padding:12},
  proofEyebrow:{color:colors.primaryLight,fontSize:lokiText.label.fontSize,fontWeight:'900',letterSpacing:.8},
  proofHint:{color:colors.textMutedGrey,fontSize:lokiText.label.fontSize,lineHeight:14,marginTop:5},
  proofReadyText:{color:colors.keep,fontSize:lokiText.label.fontSize,fontWeight:'900',marginTop:8},
  proofActions:{flexDirection:'row',gap:8,marginTop:9},
  proofButton:{flex:1,minHeight:46,borderRadius:14,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center',paddingHorizontal:8},
  proofButtonReady:{borderColor:colors.keep,backgroundColor:'rgba(229,242,102,.08)'},
  proofButtonText:{color:'#FFF',fontSize:lokiText.label.fontSize,fontWeight:'900',textAlign:'center'},
  error:{color:colors.danger,fontSize:lokiText.label.fontSize,lineHeight:15,marginTop:10,textAlign:'center'},
  paid:{minHeight:50,borderRadius:16,backgroundColor:colors.keep,alignItems:'center',justifyContent:'center',marginTop:14,paddingHorizontal:12},
  paidText:{color:'#07110D',fontSize:11,fontWeight:'900',textAlign:'center'},
  disabled:{opacity:.45},
  later:{minHeight:42,alignItems:'center',justifyContent:'center',marginTop:4},
  laterText:{color:colors.textMutedGrey,fontSize:lokiText.label.fontSize,fontWeight:'900'},
  cancelTransaction:{width:'100%',minHeight:42,borderRadius:14,borderWidth:1,borderColor:colors.danger,backgroundColor:'rgba(255,92,114,.08)',alignItems:'center',justifyContent:'center',marginTop:2},
  cancelTransactionText:{color:colors.danger,fontSize:lokiText.label.fontSize,fontWeight:'900',letterSpacing:.5},
});
