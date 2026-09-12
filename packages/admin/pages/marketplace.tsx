import React, { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';

type OfferRow = { id: string; seller_id: string; seller_username: string; playlist_id: string; playlist_name: string; price_cents: number; currency_code: string; is_active: boolean; created_at: string; updated_at: string };
type PaymentRow = { id: string; seller_id: string; seller_username: string; buyer_id: string; buyer_username: string; playlist_name: string; amount_cents: number; currency_code: string; platform_fee_cents: number; status: string; provider: string; created_at: string };

function money(cents: number, currency: string) {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

// Adel (14/09/2026) : "chaque utilisateur pourra vendre sa playlist ...
// dans le super admin il faut qu'on voit tout ce qui se passe. Tous les
// paiements ... notre plateforme prendra rien du tout la-dessus pour le
// moment." Construit integralement SAUF Stripe Connect (compte plateforme
// reserve a Adel) : ce registre reste vide tant qu'aucun paiement reel n'a
// eu lieu, mais les offres de prix deja fixees par les vendeurs sont
// visibles des maintenant.
export default function Marketplace() {
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      if (!supabase) throw new Error('Supabase Super Admin non configuré.');
      const [{ data: offerRows, error: offersError }, { data: paymentRows, error: paymentsError }] = await Promise.all([
        supabase.rpc('keep_admin_playlist_sale_offers', { p_limit: 200, p_offset: 0 }),
        supabase.rpc('keep_admin_playlist_sale_payments', { p_limit: 200, p_offset: 0 }),
      ]);
      if (offersError) throw offersError;
      if (paymentsError) throw paymentsError;
      setOffers((offerRows ?? []) as OfferRow[]);
      setPayments((paymentRows ?? []) as PaymentRow[]);
    } catch (e: any) { setError(e?.message ?? 'Impossible de charger la place de marché.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const totalByCurrency = payments.reduce<Record<string, number>>((acc, p) => {
    if (p.status !== 'COMPLETED') return acc;
    acc[p.currency_code] = (acc[p.currency_code] ?? 0) + p.amount_cents;
    return acc;
  }, {});

  return (
    <AdminLayout>
      <div className="page-title">Place de marché — Vente de playlists</div>
      <div className="page-subtitle">Offres de prix fixées par les utilisateurs et paiements entre eux — 0% de commission Loki pour l’instant</div>

      <div className="demo-banner" style={{ borderColor: '#8B5CF6' }}>
        💶 Le paiement réel (Stripe Connect, un compte par utilisateur) n’est pas encore branché. Les offres ci-dessous sont réelles et déjà enregistrées ; le registre des paiements reste vide tant qu’aucun encaissement n’est possible.
      </div>

      {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Total encaissé (paiements COMPLETED)</h3>
        {Object.keys(totalByCurrency).length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Aucun paiement pour l’instant.</p> : (
          <table><thead><tr><th>Devise</th><th>Montant</th><th>Commission Loki</th></tr></thead><tbody>
            {Object.entries(totalByCurrency).map(([currency, cents]) => <tr key={currency}><td>{currency}</td><td>{money(cents, currency)}</td><td>0%</td></tr>)}
          </tbody></table>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Offres actives ({offers.filter((o) => o.is_active).length})</h3>
        {loading ? <p>Chargement…</p> : offers.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Aucune offre pour l’instant.</p> : (
          <table><thead><tr><th>Vendeur</th><th>Playlist</th><th>Prix</th><th>Statut</th><th>Mise à jour</th></tr></thead><tbody>
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

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Paiements ({payments.length})</h3>
        {loading ? <p>Chargement…</p> : payments.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Aucun paiement pour l’instant — normal tant que Stripe Connect n’est pas branché.</p> : (
          <table><thead><tr><th>Date</th><th>Acheteur</th><th>Vendeur</th><th>Playlist</th><th>Montant</th><th>Commission Loki</th><th>Statut</th></tr></thead><tbody>
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
    </AdminLayout>
  );
}
