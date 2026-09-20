import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Linking, Image } from 'react-native';
import { colors, radius } from '../theme';
import { requestPlaylistPurchase } from '../services/playlistSaleService';

interface PlaylistSaleOffer {
  id: string;
  playlist_id: string;
  playlist_name: string;
  price_cents: number;
  currency_code: string;
  is_active: boolean;
  cover_url?: string | null;
  track_count?: number;
  created_at: string;
  updated_at: string;
}

interface PlaylistSaleCardProps {
  offer: PlaylistSaleOffer;
  isAuthenticated: boolean;
  onAuthRequired?: () => void;
}

export default function PlaylistSaleCard({
  offer,
  isAuthenticated,
  onAuthRequired,
}: PlaylistSaleCardProps) {
  const [busy, setBusy] = useState(false);
  const priceDisplay = (offer.price_cents / 100).toFixed(2);
  const currencySymbol = offer.currency_code === 'EUR' ? '€' : offer.currency_code === 'USD' ? '$' : offer.currency_code;

  const handleBuy = async () => {
    if (!isAuthenticated) {
      onAuthRequired?.();
      return;
    }

    if (busy) return;
    setBusy(true);

    try {
      const request = await requestPlaylistPurchase(offer.id);
      if (!request.payoutLink) {
        Alert.alert(
          'Paiement pas encore prêt',
          `${request.sellerUsername || 'Ce vendeur'} n'a pas encore ajouté de lien de paiement personnel. Ta demande est enregistrée -- réessaie plus tard.`,
        );
        return;
      }
      const canOpen = await Linking.canOpenURL(request.payoutLink).catch(() => true);
      if (!canOpen) throw new Error('unavailable');
      await Linking.openURL(request.payoutLink);
      Alert.alert(
        'Paie directement sur le lien du vendeur',
        `Paie ${(request.amountCents / 100).toFixed(2)} ${request.currencyCode} sur le lien qui vient de s'ouvrir. KEEP ne touche jamais cet argent -- une fois payé, ${request.sellerUsername || 'le vendeur'} confirmera et ta playlist se débloquera.`,
      );
    } catch (err: any) {
      const message = String(err?.message || '');
      if (message.includes('CANNOT_BUY_OWN_PLAYLIST')) Alert.alert('Impossible', 'Tu ne peux pas acheter ta propre playlist.');
      else if (message.includes('authentication_required')) { Alert.alert('Authentification', 'Connecte-toi pour acheter cette playlist.'); onAuthRequired?.(); }
      else Alert.alert('Erreur', 'Impossible de lancer l’achat pour le moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.card}>
      <View style={s.header}>
        {offer.cover_url ? <Image source={{ uri: offer.cover_url }} style={s.cover} /> : <View style={[s.cover, s.coverFallback]}><Text style={s.coverIcon}>♫</Text></View>}
        <View style={s.titleBlock}>
          <Text style={s.title} numberOfLines={1}>
            💿 {offer.playlist_name}
          </Text>
          <Text style={s.hint}>{offer.track_count ? `${offer.track_count} titre${offer.track_count > 1 ? 's' : ''}` : 'Playlist à vendre'} · livraison Loki</Text>
        </View>
        <View style={s.priceBlock}>
          <Text style={s.price}>
            {priceDisplay}
          </Text>
          <Text style={s.currency}>{currencySymbol}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[s.buyButton, busy && s.buyButtonBusy]}
        onPress={handleBuy}
        disabled={busy}
        activeOpacity={0.7}
      >
        {busy ? (
          <ActivityIndicator size="small" color="#38D990" />
        ) : (
          <Text style={s.buyButtonText}>
            {isAuthenticated ? 'ACHETER' : 'SE CONNECTER POUR ACHETER'}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: 18,
    marginTop: 10,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: '#0F1B16',
    borderWidth: 1,
    borderColor: '#2D5C4F',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cover: { width: 48, height: 48, borderRadius: 10, backgroundColor: '#21182F' },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  coverIcon: { color: '#38D990', fontSize: 20, fontWeight: '900' },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  priceBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 2,
  },
  price: {
    color: '#38D990',
    fontSize: 24,
    fontWeight: '900',
  },
  currency: {
    color: '#38D990',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  buyButton: {
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: '#1C4E3E',
    borderWidth: 1,
    borderColor: '#38D990',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  buyButtonBusy: {
    opacity: 0.6,
  },
  buyButtonText: {
    color: '#38D990',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
