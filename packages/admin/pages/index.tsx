import React, { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';

type Country = { code: string; name: string };
type CountRow = { plan?: string; channel?: string; country?: string; count: number };
type DailyRow = { date: string; count: number };
type DashboardData = {
  from: string;
  to: string;
  country: string | null;
  usersTotal: number;
  newUsers: number;
  verifiedEmails: number;
  activePaid: number;
  keeps: number;
  follows: number;
  shares: number;
  eventsCreated: number;
  dailySignups: DailyRow[];
  planMix: CountRow[];
  sharesByChannel: CountRow[];
  countryMix: CountRow[];
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default function Dashboard() {
  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setDate(today.getDate() - 29);
  const [from, setFrom] = useState(isoDate(monthAgo));
  const [to, setTo] = useState(isoDate(today));
  const [country, setCountry] = useState('');
  const [countries, setCountries] = useState<Country[]>([]);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!supabase) throw new Error('Supabase Super Admin non configuré.');
      const [{ data: countryRows, error: countriesError }, { data: stats, error: statsError }] = await Promise.all([
        supabase.from('countries').select('code,name').order('name'),
        supabase.rpc('admin_dashboard_stats', { p_from: from, p_to: to, p_country: country || null }),
      ]);
      if (countriesError) throw countriesError;
      if (statsError) throw statsError;
      setCountries((countryRows ?? []) as Country[]);
      setData(stats as DashboardData);
    } catch (e: any) {
      setError(e?.message ?? 'Impossible de charger les statistiques réelles.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <AdminLayout>
      <div className="page-title">Dashboard</div>
      <div className="page-subtitle">Statistiques réelles Loki — filtres par période et pays</div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
          <label>Du<br /><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>Au<br /><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label>Pays<br />
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">Tous les pays</option>
              {countries.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
            </select>
          </label>
          <button onClick={() => void load()} disabled={loading}>{loading ? 'Chargement…' : 'Appliquer'}</button>
        </div>
      </div>

      {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
      {!error && data && <div className="demo-banner">● MODE RÉEL — données lues directement depuis Supabase. Les partages sont comptés par type à partir de cette version.</div>}

      {data && (
        <>
          <div className="kpi-grid">
            <div className="kpi-card"><div className="kpi-value">{data.usersTotal}</div><div className="kpi-label">Utilisateurs totaux</div></div>
            <div className="kpi-card"><div className="kpi-value">{data.newUsers}</div><div className="kpi-label">Nouveaux sur la période</div></div>
            <div className="kpi-card"><div className="kpi-value">{data.verifiedEmails}</div><div className="kpi-label">E-mails vérifiés</div></div>
            <div className="kpi-card"><div className="kpi-value">{data.activePaid}</div><div className="kpi-label">Abonnements payants actifs</div></div>
            <div className="kpi-card"><div className="kpi-value">{data.keeps}</div><div className="kpi-label">Morceaux gardés sur la période</div></div>
            <div className="kpi-card"><div className="kpi-value">{data.follows}</div><div className="kpi-label">Nouveaux abonnements / suivis</div></div>
            <div className="kpi-card"><div className="kpi-value">{data.shares}</div><div className="kpi-label">Partages</div></div>
            <div className="kpi-card"><div className="kpi-value">{data.eventsCreated}</div><div className="kpi-label">Événements créés</div></div>
          </div>

          <div className="card" style={{ marginTop: 22 }}>
            <h3 style={{ marginTop: 0 }}>Inscriptions par jour</h3>
            <table><thead><tr><th>Date</th><th>Nouveaux utilisateurs</th></tr></thead><tbody>
              {data.dailySignups.map((row) => <tr key={row.date}><td>{new Date(`${row.date}T12:00:00`).toLocaleDateString('fr-FR')}</td><td>{row.count}</td></tr>)}
            </tbody></table>
          </div>

          <div className="card" style={{ marginTop: 22 }}>
            <h3 style={{ marginTop: 0 }}>Répartition des offres</h3>
            <table><thead><tr><th>Formule</th><th>Utilisateurs</th></tr></thead><tbody>
              {data.planMix.length ? data.planMix.map((row) => <tr key={row.plan}><td>{row.plan}</td><td>{row.count}</td></tr>) : <tr><td colSpan={2}>Aucune donnée.</td></tr>}
            </tbody></table>
          </div>

          <div className="card" style={{ marginTop: 22 }}>
            <h3 style={{ marginTop: 0 }}>Partages par type</h3>
            <table><thead><tr><th>Canal</th><th>Partages</th></tr></thead><tbody>
              {data.sharesByChannel.length ? data.sharesByChannel.map((row) => <tr key={row.channel}><td>{row.channel}</td><td>{row.count}</td></tr>) : <tr><td colSpan={2}>Les compteurs démarrent avec la nouvelle version.</td></tr>}
            </tbody></table>
          </div>

          <div className="card" style={{ marginTop: 22 }}>
            <h3 style={{ marginTop: 0 }}>Utilisateurs par pays</h3>
            <table><thead><tr><th>Pays</th><th>Utilisateurs</th></tr></thead><tbody>
              {data.countryMix.map((row) => <tr key={row.country}><td>{row.country === '--' ? 'Non renseigné' : row.country}</td><td>{row.count}</td></tr>)}
            </tbody></table>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
