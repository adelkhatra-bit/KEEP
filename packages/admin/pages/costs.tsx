import React, { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';

type Country = { code: string; name: string };
type MoneyRow = { currency: string; gross?: number | string; amount?: number | string; transactions?: number; refunds?: number; entries?: number };
type TransactionRow = { id: string; date: string; amount: number | string; currency: string; country: string | null; status: string; channel: string };
type CostRow = { id: string; date: string; category: string; label: string; amount: number | string; currency: string; country: string | null; period: string };
type FinanceReport = {
  revenueByCurrency: MoneyRow[];
  refundsByCurrency: MoneyRow[];
  costsByCurrency: MoneyRow[];
  recentTransactions: TransactionRow[];
  recentCosts: CostRow[];
};

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function money(value: number | string | undefined, currency: string) {
  return `${Number(value ?? 0).toFixed(2)} ${currency}`;
}

export default function Costs() {
  const today = new Date();
  const monthAgo = new Date(today); monthAgo.setDate(today.getDate() - 29);
  const [from, setFrom] = useState(isoDate(monthAgo));
  const [to, setTo] = useState(isoDate(today));
  const [country, setCountry] = useState('');
  const [countries, setCountries] = useState<Country[]>([]);
  const [report, setReport] = useState<FinanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [category, setCategory] = useState('service');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [period, setPeriod] = useState('MONTHLY');
  const [costCountry, setCostCountry] = useState('');
  const [costDate, setCostDate] = useState(isoDate(today));

  const load = async () => {
    setLoading(true); setError(null);
    try {
      if (!supabase) throw new Error('Supabase Super Admin non configuré.');
      const [{ data: countryRows, error: countriesError }, { data, error: reportError }] = await Promise.all([
        supabase.from('countries').select('code,name').order('name'),
        supabase.rpc('admin_finance_report', { p_from: from, p_to: to, p_country: country || null }),
      ]);
      if (countriesError) throw countriesError;
      if (reportError) throw reportError;
      setCountries((countryRows ?? []) as Country[]);
      setReport(data as FinanceReport);
    } catch (e: any) { setError(e?.message ?? 'Impossible de charger la comptabilité.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const addCost = async () => {
    if (!supabase || !label.trim() || !amount) return;
    setError(null); setMessage(null);
    try {
      const { error: rpcError } = await supabase.rpc('admin_record_operating_cost', {
        p_category: category.trim(), p_label: label.trim(), p_amount: Number(amount),
        p_currency_code: currency, p_period: period, p_country: costCountry || null,
        p_recorded_at: `${costDate}T12:00:00Z`,
      });
      if (rpcError) throw rpcError;
      setLabel(''); setAmount('');
      setMessage('Coût enregistré dans Supabase et journalisé.');
      await load();
    } catch (e: any) { setError(e?.message ?? 'Impossible d’enregistrer le coût.'); }
  };

  const deleteCost = async (id: string) => {
    if (!supabase) return;
    setError(null); setMessage(null);
    try {
      const { error: rpcError } = await supabase.rpc('admin_delete_operating_cost', { p_id: id });
      if (rpcError) throw rpcError;
      setMessage('Coût supprimé et action journalisée.');
      await load();
    } catch (e: any) { setError(e?.message ?? 'Suppression impossible.'); }
  };

  return (
    <AdminLayout>
      <div className="page-title">Comptabilité & Rentabilité</div>
      <div className="page-subtitle">Transactions, remboursements et coûts réels — jamais de mélange entre devises</div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
          <label>Du<br /><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>Au<br /><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label>Pays<br /><select value={country} onChange={(e) => setCountry(e.target.value)}><option value="">Tous</option>{countries.map(c => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}</select></label>
          <button onClick={() => void load()} disabled={loading}>{loading ? 'Chargement…' : 'Appliquer'}</button>
        </div>
      </div>

      {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
      {message && <div className="demo-banner" style={{ borderColor: '#2e7d32' }}>{message}</div>}
      {!error && report && <div className="demo-banner">● MODE RÉEL — écritures lues dans Supabase. Les montants restent séparés par devise et pays.</div>}

      {report && (
        <>
          <div className="card" style={{ marginBottom: 22 }}>
            <h3 style={{ marginTop: 0 }}>Synthèse financière</h3>
            <table><thead><tr><th>Type</th><th>Devise</th><th>Montant</th><th>Écritures</th></tr></thead><tbody>
              {report.revenueByCurrency.map(r => <tr key={`rev-${r.currency}`}><td>Revenus encaissés</td><td>{r.currency}</td><td>{money(r.gross, r.currency)}</td><td>{r.transactions ?? 0}</td></tr>)}
              {report.refundsByCurrency.map(r => <tr key={`ref-${r.currency}`}><td>Remboursements</td><td>{r.currency}</td><td>{money(r.amount, r.currency)}</td><td>{r.refunds ?? 0}</td></tr>)}
              {report.costsByCurrency.map(r => <tr key={`cost-${r.currency}`}><td>Coûts</td><td>{r.currency}</td><td>{money(r.amount, r.currency)}</td><td>{r.entries ?? 0}</td></tr>)}
              {!report.revenueByCurrency.length && !report.refundsByCurrency.length && !report.costsByCurrency.length && <tr><td colSpan={4}>Aucune écriture sur cette période.</td></tr>}
            </tbody></table>
          </div>

          <div className="card" style={{ marginBottom: 22 }}>
            <h3 style={{ marginTop: 0 }}>Ajouter un coût</h3>
            <p style={{ color: 'var(--text-muted)' }}>Exemples : Supabase, AudD, hébergement, e-mail, support, publicité. Laisse le pays vide pour un coût global.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Catégorie" />
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Libellé" />
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Montant" />
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}><option>EUR</option><option>USD</option><option>GBP</option><option>AED</option></select>
              <select value={period} onChange={(e) => setPeriod(e.target.value)}><option value="MONTHLY">Mensuel</option><option value="YEARLY">Annuel</option></select>
              <select value={costCountry} onChange={(e) => setCostCountry(e.target.value)}><option value="">Global</option>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select>
              <input type="date" value={costDate} onChange={(e) => setCostDate(e.target.value)} />
            </div>
            <button style={{ marginTop: 12 }} onClick={() => void addCost()} disabled={!label.trim() || !amount}>Enregistrer le coût</button>
          </div>

          <div className="card" style={{ marginBottom: 22 }}>
            <h3 style={{ marginTop: 0 }}>Transactions récentes</h3>
            <table><thead><tr><th>Date</th><th>Pays</th><th>Canal</th><th>Statut</th><th>Montant</th></tr></thead><tbody>
              {report.recentTransactions.length ? report.recentTransactions.map(t => <tr key={t.id}><td>{new Date(t.date).toLocaleString('fr-FR')}</td><td>{t.country ?? '—'}</td><td>{t.channel}</td><td>{t.status}</td><td>{money(t.amount, t.currency)}</td></tr>) : <tr><td colSpan={5}>Aucune transaction réelle.</td></tr>}
            </tbody></table>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Coûts enregistrés</h3>
            <table><thead><tr><th>Date</th><th>Pays</th><th>Catégorie</th><th>Libellé</th><th>Montant</th><th /></tr></thead><tbody>
              {report.recentCosts.length ? report.recentCosts.map(c => <tr key={c.id}><td>{new Date(c.date).toLocaleDateString('fr-FR')}</td><td>{c.country ?? 'Global'}</td><td>{c.category}</td><td>{c.label}</td><td>{money(c.amount,c.currency)}</td><td><button onClick={() => void deleteCost(c.id)}>Supprimer</button></td></tr>) : <tr><td colSpan={6}>Aucun coût enregistré.</td></tr>}
            </tbody></table>
          </div>
        </>
      )}
      <p className="save-hint">Ce tableau prépare la gestion interne Loki. Il ne remplace pas une comptabilité légale ni les exports fiscaux du prestataire de paiement.</p>
    </AdminLayout>
  );
}
