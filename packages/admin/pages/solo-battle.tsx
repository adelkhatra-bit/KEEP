import React, { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import Hint from '../components/Hint';
import { supabase } from '../lib/supabaseClient';
import { isRpcMissing, rpcErrorText } from '../lib/rpcErrors';

// Solo / Battle (Lot 5, 12/10/2026) : lecture seule via
// keep_admin_solo_battle_overview (migration 20261013000300). Tolérant :
// la page s'affiche sans la RPC, et durée / mises restent « non disponibles »
// tant que keep_battle_solo_history n'enregistre ni started_at ni mise.
type SoloOverview = {
  days: number; gamesToday: number; gamesPeriod: number; freeEarnedPeriod: number; freeStakedPeriod: number | null;
  avgDurationSeconds: number | null; durationAvailable: boolean; suspiciousGames: number; suspiciousProfiles: number;
};

export default function SoloBattleAdmin() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<SoloOverview | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true); setError(null);
      try {
        if (!supabase) throw new Error('Supabase Super Admin non configuré.');
        const { data: row, error: rpcError } = await supabase.rpc('keep_admin_solo_battle_overview', { p_days: days });
        if (!active) return;
        if (rpcError) { if (isRpcMissing(rpcError)) { setMissing(true); setData(null); } else throw rpcError; }
        else { setMissing(false); setData(row as SoloOverview); }
      } catch (e: any) { if (active) setError(rpcErrorText(e, 'Impossible de charger Solo / Battle.')); }
      finally { if (active) setLoading(false); }
    };
    void run();
    return () => { active = false; };
  }, [days]);

  const na = <span style={{ color: 'var(--text-muted)' }}>non disponible</span>;
  const kpi = (value: React.ReactNode, label: string) => <div className="stat"><b>{value}</b><span>{label}</span></div>;

  return (
    <AdminLayout>
      <div className="page-title">Solo / Battle <Hint title="Solo / Battle" text="Parties jouées, FREE gagnés, durée moyenne et parties suspectes (moins de 5 secondes par manche). Lecture seule." /></div>
      {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
      <div style={{ marginBottom: 12 }}>
        {[1, 7, 30].map((d) => <button key={d} className="button" style={{ marginRight: 8, opacity: days === d ? 1 : 0.6 }} onClick={() => setDays(d)}>{d === 1 ? '24 h' : `${d} jours`}</button>)}
      </div>
      <div className="card">
        {loading ? <p>Chargement…</p> : missing ? (
          <p style={{ color: 'var(--text-muted)' }}>À activer : la lecture Solo / Battle n’est pas encore appliquée en production (migration 20261013000300).</p>
        ) : data ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {kpi(data.gamesToday, 'parties aujourd’hui')}
            {kpi(data.gamesPeriod, `parties sur ${data.days} j`)}
            {kpi(data.freeEarnedPeriod, 'FREE gagnés')}
            {kpi(data.freeStakedPeriod ?? na, 'FREE misés')}
            {kpi(data.avgDurationSeconds != null ? `${data.avgDurationSeconds} s` : na, 'durée moyenne')}
            {kpi(data.durationAvailable ? data.suspiciousGames : na, 'parties suspectes (< 5 s / manche)')}
            {kpi(data.suspiciousProfiles, 'profils à séries parfaites répétées')}
          </div>
        ) : null}
      </div>
    </AdminLayout>
  );
}
