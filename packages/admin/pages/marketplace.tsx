import React, { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';

type OfferRow = { id: string; seller_id: string; seller_username: string; playlist_id: string; playlist_name: string; price_cents: number; currency_code: string; is_active: boolean; created_at: string; updated_at: string };
type PaymentRow = { id: string; seller_id: string; seller_username: string; buyer_id: string; buyer_username: string; playlist_name: string; amount_cents: number; currency_code: string; platform_fee_cents: number; status: string; provider: string; created_at: string };
type EventTicketOrderRow = { id: string; seller_id: string; seller_username: string; buyer_id: string; buyer_username: string; event_name: string; amount_cents: number; currency_code: string; platform_fee_cents: number; status: string; provider: string; created_at: string };

function money(cents: number, currency: string) {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

// Adel (14/09/2026 puis 17-18/09/2026) : "dans le super admin il faut qu'on
// voit tout ce qui se passe". Construit intégralement SAUF ce que KEEP ne
// doit justement jamais toucher : l'argent lui-même. Chaque vendeur/
// organisateur colle son propre lien de paiement personnel (PayPal/Lydia) --
// l'acheteur paie directement là-dessus, jamais via un compte KEEP. Ces
// registres restent à 0% de commission par construction, pas par promesse :
// KEEP ne voit techniquement jamais la transaction, seulement sa confirmation
// manuelle par le vendeur.
export default function Marketplace() {
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [ticketOrders, setTicketOrders] = useState<EventTicketOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      if (!supabase) throw new Error('Supabase Super Admin non configuré.');
      const [
        { data: offerRows, error: offersError },
        { data: paymentRows, error: paymentsError },
        { data: ticketOrderRows, error: ticketOrdersError },
      ] = await Promise.all([
        supabase.rpc('keep_admin_playlist_sale_offers', { p_limit: 200, p_offset: 0 }),
        supabase.rpc('keep_admin_playlist_sale_payments', { p_limit: 200, p_offset: 0 }),
        supabase.rpc('keep_admin_event_ticket_orders', { p_limit: 200, p_offset: 0 }),
      ]);
      if (offersError) throw offersError;
      if (paymentsError) throw paymentsError;
      if (ticketOrdersError) throw ticketOrdersError;
      setOffers((offerRows ?? []) as OfferRow[]);
      setPayments((paymentRows ?? []) as PaymentRow[]);
      setTicketOrders((ticketOrderRows ?? []) as EventTicketOrderRow[]);
    } catch (e: any) { setError(e?.message ?? 'Impossible de charger la place de marché.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const totalByCurrency = payments.reduce<Record<string, number>>((acc, p) => {
    if (p.status !== 'COMPLETED') return acc;
    acc[p.currency_code] = (acc[p.currency_code] ?? 0) + p.amount_cents;
    return acc;
  }, {});
  const ticketTotalByCurrency = ticketOrders.reduce<Record<string, number>>((acc, o) => {
    if (o.status !== 'COMPLETED') return acc;
    acc[o.currency_code] = (acc[o.currency_code] ?? 0) + o.amount_cents;
    return acc;
  }, {});

  return (
    <AdminLayout>
      <div className="page-title">Place de marché — Playlists, musique &amp; billets</div>
      <div className="page-subtitle">Prix fixés par les utilisateurs, paiements directs entre eux — 0% de commission Loki Music, Loki Music ne touche jamais l’argent</div>

      <div className="demo-banner" style={{ borderColor: '#8B5CF6' }}>
        💶 Modèle "lien de paiement personnel" : chaque vendeur/organisateur colle son propre PayPal/Lydia dans ses réglages. L'acheteur paie directement là-dessus, hors de Loki Music — le statut "COMPLETED" ci-dessous vient uniquement de la confirmation manuelle du vendeur, jamais d'un encaissement Loki Music.
      </div>

      {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Total confirmé — playlists &amp; musique (statut COMPLETED)</h3>
        {Object.keys(totalByCurrency).length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Aucune vente confirmée pour l’instant.</p> : (
          <table><thead><tr><th>Devise</th><th>Montant</th><th>Commission Loki Music</th></tr></thead><tbody>
            {Object.entries(totalByCurrency).map(([currency, cents]) => <tr key={currency}><td>{currency}</td><td>{money(cents, currency)}</td><td>0%</td></tr>)}
          </tbody></table>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Total confirmé — billets d’évènements (statut COMPLETED)</h3>
        {Object.keys(ticketTotalByCurrency).length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Aucun billet confirmé pour l’instant.</p> : (
          <table><thead><tr><th>Devise</th><th>Montant</th><th>Commission Loki Music</th></tr></thead><tbody>
            {Object.entries(ticketTotalByCurrency).map(([currency, cents]) => <tr key={currency}><td>{currency}</td><td>{money(cents, currency)}</td><td>0%</td></tr>)}
          </tbody></table>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Offres actives ({offers.filter((o) => o.is_active).length})</h3>
        {loading ? <p>Chargement…</p> : offers.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Aucune offre pour l’instant.</p> : (
          <table><thead><tr><th>Vendeur</th><th>Playlist / morceau / album</th><th>Prix</th><th>Statut</th><th>Mise à jour</th></tr></thead><tbody>
            {offers.map((o) => (
              <tr key={o.id} style={{ opacity: o.is_active ? 1 : 0.5 }}>
                <td>@{o.seller_username}</td>
                <td>{o.playlist_name}</td>
                <td>{money(o.price_cents, o.currency_code)}</td>
                <td>{o.is_active ? 'Active' : 'Retirée'}</td>
                <td>{new Date(o.updated_at).toLocaleString('fr-FR')}</td>
              </tr>
            ))}
          </tbody></table>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Paiements — playlists &amp; musique ({payments.length})</h3>
        {loading ? <p>Chargement…</p> : payments.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Aucun paiement demandé pour l’instant.</p> : (
          <table><thead><tr><th>Date</th><th>Acheteur</th><th>Vendeur</th><th>Vendu</th><th>Montant</th><th>Commission Loki Music</th><th>Statut</th></tr></thead><tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.created_at).toLocaleString('fr-FR')}</td>
                <td>@{p.buyer_username}</td>
                <td>@{p.seller_username}</td>
                <td>{p.playlist_name}</td>
                <td>{money(p.amount_cents, p.currency_code)}</td>
                <td>{money(p.platform_fee_cents, p.currency_code)}</td>
                <td>{p.status}</td>
              </tr>
            ))}
          </tbody></table>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Billets — évènements payants ({ticketOrders.length})</h3>
        {loading ? <p>Chargement…</p> : ticketOrders.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Aucun billet demandé pour l’instant.</p> : (
          <table><thead><tr><th>Date</th><th>Acheteur</th><th>Organisateur</th><th>Évènement</th><th>Montant</th><th>Commission Loki Music</th><th>Statut</th></tr></thead><tbody>
            {ticketOrders.map((o) => (
              <tr key={o.id}>
                <td>{new Date(o.created_at).toLocaleString('fr-FR')}</td>
                <td>@{o.buyer_username}</td>
                <td>@{o.seller_username}</td>
                <td>{o.event_name}</td>
                <td>{money(o.amount_cents, o.currency_code)}</td>
                <td>{money(o.platform_fee_cents, o.currency_code)}</td>
                <td>{o.status}</td>
              </tr>
            ))}
          </tbody></table>
        )}
      </div>
    </AdminLayout>
  );
}
