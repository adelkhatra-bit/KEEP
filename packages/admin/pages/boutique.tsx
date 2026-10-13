import React, { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import Hint from '../components/Hint';
import { supabase } from '../lib/supabaseClient';
import { isRpcMissing, rpcErrorText } from '../lib/rpcErrors';

// Argent > Boutique (Lot 5, 12/10/2026). Les RPC viennent de
// supabase/migrations/20261013000100..200 : tant qu'elles ne sont pas appliquées
// en production, la page s'affiche quand même et dit « à activer ».
type Overview = {
  activeOffers: number; inactiveOffers: number; sellers: number; profiles: number; emptyBoutiques: number;
  freePayments: number; freeVolume: number; moneyPayments: number; moneyVolumeCents: number; marketplaceFlagEnabled: boolean;
};
type OfferRow = { id: string; seller_username: string; playlist_name: string; price_cents: number; currency_code: string; is_active: boolean; updated_at: string };
type PaymentRow = { id: string; seller_username: string; buyer_username: string; playlist_name: string; amount_cents: number; amount_free: number; currency_code: string; status: string; payment_mode: string; created_at: string };

const SETTINGS: { key: string; label: string; hint: string; fallback: number; min: number; max: number }[] = [
  { key: 'playlist_sale_follower_threshold', label: 'Abonnés requis pour vendre', hint: 'Valeur actuelle effective : 100.', fallback: 100, min: 0, max: 100000 },
  { key: 'playlist_sale_max_active_offers', label: 'Plafond d’offres actives par vendeur', hint: 'Garde-fou serveur (1 à 500).', fallback: 50, min: 1, max: 500 },
  { key: 'boutique_featured_count', label: 'Aperçus enchaînés « à la une »', hint: 'De 1 à 6.', fallback: 3, min: 1, max: 6 },
  { key: 'desktop_boutique_columns', label: 'Colonnes sur ordinateur', hint: 'De 2 à 4.', fallback: 3, min: 2, max: 4 },
  { key: 'desktop_boutique_columns_wide', label: 'Colonnes sur grand écran', hint: 'De 2 à 4.', fallback: 4, min: 2, max: 4 },
];
const FREE_OPEN_KEY = 'playlist_sale_free_without_threshold';

export default function BoutiqueAdmin() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewMissing, setOverviewMissing] = useState(false);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentsMissing, setPaymentsMissing] = useState(false);
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [flag, setFlag] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      if (!supabase) throw new Error('Supabase Super Admin non configuré.');
      const [ov, off, pay, cfg, fl] = await Promise.all([
        supabase.rpc('keep_admin_boutique_overview'),
        supabase.rpc('keep_admin_playlist_sale_offers', { p_limit: 200, p_offset: 0 }),
        supabase.rpc('keep_admin_playlist_sale_payments_detail', { p_limit: 100, p_offset: 0 }),
        supabase.rpc('admin_remote_config_list'),
        supabase.from('feature_flags').select('is_enabled_globally').eq('key', 'playlist_marketplace').maybeSingle(),
      ]);
      if (ov.error) { if (isRpcMissing(ov.error)) { setOverviewMissing(true); setOverview(null); } else throw ov.error; } else { setOverviewMissing(false); setOverview(ov.data as Overview); }
      if (off.error) throw off.error;
      setOffers((off.data ?? []) as OfferRow[]);
      if (pay.error) { if (isRpcMissing(pay.error)) { setPaymentsMissing(true); setPayments([]); } else throw pay.error; } else { setPaymentsMissing(false); setPayments((pay.data ?? []) as PaymentRow[]); }
      if (!cfg.error) {
        const map: Record<string, unknown> = {};
        for (const row of (cfg.data ?? []) as { key: string; value: unknown }[]) map[row.key] = row.value;
        setConfig(map);
      }
      setFlag(fl.data ? Boolean((fl.data as any).is_enabled_globally) : null);
    } catch (e: any) { setError(rpcErrorText(e, 'Impossible de charger la Boutique.')); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const saveSetting = async (key: string, value: unknown, description: string) => {
    if (!supabase) return;
    setBusy(key); setError(null); setNote(null);
    try {
      const { error: e } = await supabase.rpc('admin_remote_config_set', { p_key: key, p_value: value, p_description: description });
      if (e) throw e;
      setNote(`Enregistré : ${description}`);
      await load();
    } catch (e: any) { setError(rpcErrorText(e, 'Enregistrement impossible (rôle SUPER_ADMIN ou ADMIN requis).')); }
    finally { setBusy(null); }
  };

  const saveNumber = (s: typeof SETTINGS[number]) => {
    const raw = drafts[s.key] ?? String(config[s.key] ?? s.fallback);
    const n = Number(raw);
    if (!Number.isInteger(n) || n < s.min || n > s.max) { setError(`${s.label} : entier entre ${s.min} et ${s.max}.`); return; }
    void saveSetting(s.key, n, s.label);
  };

  const setOfferActive = async (offer: OfferRow, active: boolean) => {
    if (!supabase) return;
    const reason = active ? 'Rétablie par le Super Admin' : (window.prompt('Motif du retrait (journalisé) :', 'Contenu à vérifier') ?? '');
    if (!active && !reason.trim()) return;
    setBusy(offer.id); setError(null);
    try {
      const { error: e } = await supabase.rpc('keep_admin_playlist_sale_set_active', { p_offer_id: offer.id, p_active: active, p_reason: reason });
      if (e) throw e;
      await load();
    } catch (e: any) { setError(isRpcMissing(e) ? 'Action à activer : la migration 20261013000200 n’est pas encore appliquée.' : rpcErrorText(e, 'Action impossible.')); }
    finally { setBusy(null); }
  };

  const toggleFlag = async () => {
    if (!supabase || flag == null) return;
    const next = !flag;
    const ok = window.confirm(next
      ? 'Activer le paiement en euros / la place de marché ? Réservé à une décision explicite d’Adel (cadre juridique et Apple).'
      : 'Désactiver la place de marché ?');
    if (!ok) return;
    setBusy('flag'); setError(null);
    try {
      const { error: e } = await supabase.rpc('admin_feature_flag_set', { p_key: 'playlist_marketplace', p_enabled: next });
      if (e) throw e;
      await load();
    } catch (e: any) { setError(rpcErrorText(e, 'Changement impossible (rôle SUPER_ADMIN, ADMIN ou TECH requis).')); }
    finally { setBusy(null); }
  };

  const freeOpen = String(config[FREE_OPEN_KEY] ?? 'false').toLowerCase() === 'true';
  const missing = (label: string) => <p style={{ color: 'var(--text-muted)' }}>{label} : à activer (migration non appliquée en production).</p>;
  const kpi = (value: string | number, label: string) => <div className="stat"><b>{value}</b><span>{label}</span></div>;

  return (
    <AdminLayout>
      <div className="page-title">Boutique <Hint title="Boutique" text="Vitrine de vente des collections : offres, seuil d’abonnés, paiements FREE et retrait d’une offre. Le paiement en euros reste coupé tant que le drapeau est désactivé." /></div>
      {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
      {note && <div className="demo-banner">{note}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Chiffres clés</h3>
        {loading ? <p>Chargement…</p> : overview ? (
          <div className="stats-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {kpi(overview.activeOffers, 'offres actives')}
            {kpi(overview.sellers, 'vendeurs')}
            {kpi(overview.freePayments, 'paiements FREE')}
            {kpi(overview.freeVolume, 'FREE échangés')}
            {kpi(overview.moneyPayments, 'paiements en euros')}
            {kpi(`${(overview.moneyVolumeCents / 100).toFixed(2)} €`, 'volume euros confirmé')}
            {kpi(`${overview.emptyBoutiques} / ${overview.profiles}`, 'boutiques vides')}
          </div>
        ) : overviewMissing ? missing('Chiffres clés') : null}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Paiement en euros <Hint title="Drapeau playlist_marketplace" text="Seul le FREE fonctionne tant que ce drapeau est désactivé. Ne l’active qu’avec l’accord explicite d’Adel." /></h3>
        <p>État : <b>{flag == null ? 'inconnu' : flag ? 'ACTIVÉ' : 'DÉSACTIVÉ (FREE seulement)'}</b></p>
        <button className="button" disabled={flag == null || busy === 'flag'} onClick={() => void toggleFlag()}>{flag ? 'Désactiver' : 'Activer'} (confirmation demandée)</button>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Réglages</h3>
        {Object.keys(config).length === 0 && !loading ? <p style={{ color: 'var(--text-muted)' }}>Réglages indisponibles (rôle SUPER_ADMIN ou ADMIN requis, ou clés à créer par la migration 20261013000100). Valeurs de repli utilisées par l’app : seuil 100, plafond 50, à la une 3.</p> : null}
        <table><thead><tr><th>Réglage</th><th>Valeur</th><th /></tr></thead><tbody>
          {SETTINGS.map((s) => (
            <tr key={s.key}>
              <td>{s.label}<br /><small style={{ color: 'var(--text-muted)' }}>{s.hint} Clé : {s.key}{config[s.key] === undefined ? ' (non créée : repli ' + s.fallback + ')' : ''}</small></td>
              <td><input type="number" value={drafts[s.key] ?? String(config[s.key] ?? s.fallback)} onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))} style={{ width: 90 }} /></td>
              <td><button className="button" disabled={busy === s.key} onClick={() => saveNumber(s)}>Enregistrer</button></td>
            </tr>
          ))}
          <tr>
            <td>Vendre sans seuil d’abonnés<br /><small style={{ color: 'var(--text-muted)' }}>Décision d’Adel. Par défaut : non (comportement actuel). Clé : {FREE_OPEN_KEY}</small></td>
            <td>{freeOpen ? 'Oui' : 'Non'}</td>
            <td><button className="button" disabled={busy === FREE_OPEN_KEY} onClick={() => { if (window.confirm(freeOpen ? 'Remettre le seuil d’abonnés obligatoire ?' : 'Autoriser la vente sans seuil d’abonnés ?')) void saveSetting(FREE_OPEN_KEY, !freeOpen, 'Vendre sans seuil d’abonnés'); }}>{freeOpen ? 'Remettre le seuil' : 'Autoriser sans seuil'}</button></td>
          </tr>
        </tbody></table>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Offres ({offers.filter((o) => o.is_active).length} actives)</h3>
        {loading ? <p>Chargement…</p> : offers.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Aucune offre.</p> : (
          <table><thead><tr><th>Vendeur</th><th>Collection</th><th>Prix</th><th>Statut</th><th /></tr></thead><tbody>
            {offers.map((o) => (
              <tr key={o.id} style={{ opacity: o.is_active ? 1 : 0.55 }}>
                <td>@{o.seller_username}</td><td>{o.playlist_name}</td>
                <td>{(o.price_cents / 100).toFixed(2)} {o.currency_code}</td>
                <td>{o.is_active ? 'Active' : 'Retirée'}</td>
                <td><button className="button" disabled={busy === o.id} onClick={() => void setOfferActive(o, !o.is_active)}>{o.is_active ? 'Retirer' : 'Rétablir'}</button></td>
              </tr>
            ))}
          </tbody></table>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Paiements FREE et euros</h3>
        {paymentsMissing ? missing('Détail des paiements (FREE inclus)') : loading ? <p>Chargement…</p> : payments.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Aucun paiement.</p> : (
          <table><thead><tr><th>Date</th><th>Acheteur</th><th>Vendeur</th><th>Collection</th><th>FREE</th><th>Euros</th><th>Statut</th></tr></thead><tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.created_at).toLocaleString('fr-FR')}</td><td>@{p.buyer_username}</td><td>@{p.seller_username}</td><td>{p.playlist_name}</td>
                <td>{p.amount_free || '—'}</td><td>{p.amount_cents ? `${(p.amount_cents / 100).toFixed(2)} ${p.currency_code}` : '—'}</td><td>{p.status}</td>
              </tr>
            ))}
          </tbody></table>
        )}
      </div>
    </AdminLayout>
  );
}
