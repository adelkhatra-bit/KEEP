import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Linking } from 'react-native';
import { colors, typography, spacing, radius } from '../theme';
import { supabase } from '../services/supabaseClient';

interface PlaylistSaleOffer {
  id: string;
  playlist_id: string;
  playlist_name: string;
  price_cents: number;
  currency_code: string;
  is_active: boolean;
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
      const token = (await supabase.auth.getSession())?.data?.session?.access_token;
      if (!token) {
        Alert.alert('Authentification', 'Connecte-toi pour acheter cette playlist.');
        onAuthRequired?.();
        return;
      }

      const response = await fetch('https://rrhqsqzcplvmwxizqnla.supabase.co/functions/v1/keep-stripe-playlist-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ offerId: offer.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        Alert.alert('Erreur', data?.error || 'Impossible de créer la session de paiement.');
        return;
      }

      if (data?.checkoutUrl) {
        await Linking.openURL(data.checkoutUrl);
      } else {
        Alert.alert('Erreur', 'URL de paiement non trouvée.');
      }
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || 'Erreur lors de l\'accès au paiement.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={s.titleBlock}>
          <Text style={s.title} numberOfLines={1}>
            💿 {offer.playlist_name}
          </Text>
          <Text style={s.hint}>Playlist à vendre</Text>
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
