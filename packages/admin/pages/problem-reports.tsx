import React, { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';

// Super Admin › Modération › Signalements (06/10/2026) : les « secousses » et diagnostics automatiques de l'app
// (table app_problem_reports) étaient invisibles. Lecture via admin_problem_reports (rôles de modération uniquement).
type Report = {
  id: string; created_at: string; kind: string | null; status: 'NEW' | 'SEEN' | 'FIXED'; message: string;
  screen: string | null; platform: string | null; app_version: string | null; username: string | null;
};
type Filter = 'NEW' | 'SEEN' | 'FIXED' | 'ALL';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'NEW', label: 'À voir' },
  { key: 'SEEN', label: 'Vus' },
  { key: 'FIXED', label: 'Corrigés' },
  { key: 'ALL', label: 'Tous' },
];
const KIND_LABEL: Record<string, string> = { SHAKE: '📳 Secousse', MANUAL: '✍️ Signalé' };
const isAuto = (message: string) => message.startsWith('[AUTO]');
const autoCode = (message: string) => message.replace(/^\[AUTO\]\s*/, '').split(' — ')[0];

export default function ProblemReports() {
  const [filter, setFilter] = useState<Filter>('NEW');
  const [rows, setRows] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true); setError('');
    const { data, error: rpcError } = await supabase.rpc('admin_problem_reports', { p_status: filter, p_limit: 300 });
    if (rpcError) {
      setError(/admin_problem_reports/.test(rpcError.message) ? 'Mise à jour serveur en attente' : rpcError.message);
      setRows([]);
    } else setRows((data ?? []) as Report[]);
    setLoading(false);
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const setStatus = async (id: string, status: 'SEEN' | 'FIXED' | 'NEW') => {
    if (!supabase) return;
    setBusy(id);
    const { error: rpcError } = await supabase.rpc('admin_problem_report_set_status', { p_id: id, p_status: status });
    setBusy(null);
    if (rpcError) { setError(rpcError.message); return; }
    void load();
  };

  // Regroupement des diagnostics automatiques identiques (même code) pour voir les vraies causes d'un coup d'œil.
  const autoGroups = rows.filter((r) => isAuto(r.message)).reduce<Record<string, number>>((acc, r) => {
    const code = autoCode(r.message); acc[code] = (acc[code] ?? 0) + 1; return acc;
  }, {});

  return (
    <AdminLayout>
      <div className="page-title">Signalements</div>
      <div className="page-subtitle">Secousses et erreurs de l’app</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 14 }}>
        {FILTERS.map((f) => (
          <button key={f.key} className="btn" onClick={() => setFilter(f.key)}
            style={{ minHeight: 40, borderRadius: 10, fontWeight: 800, border: '1px solid var(--border)', background: filter === f.key ? 'var(--primary)' : 'transparent', color: filter === f.key ? '#fff' : 'var(--text)' }}>
            {f.label}
          </button>
        ))}
      </div>

      {error ? <div className="demo-banner" style={{ borderColor: '#b42318' }}>{error}</div> : null}
      {loading ? <div className="card">Chargement…</div> : null}
      {!loading && !error && !rows.length ? <div className="card" style={{ color: 'var(--text-muted)' }}>Rien à traiter</div> : null}

      {Object.keys(autoGroups).length ? (
        <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {Object.entries(autoGroups).sort((a, b) => b[1] - a[1]).map(([code, count]) => (
            <span key={code} style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid var(--border)', fontSize: 12, fontWeight: 800, overflowWrap: 'anywhere' }}>{code} × {count}</span>
          ))}
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 10 }}>
        {rows.map((r) => {
          const expanded = Boolean(open[r.id]);
          const short = r.message.length > 110 && !expanded ? `${r.message.slice(0, 110)}…` : r.message;
          return (
            <div key={r.id} className="card" style={{ display: 'grid', gap: 8, marginBottom: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 12, fontWeight: 800 }}>
                <span>{isAuto(r.message) ? '🤖 Auto' : (KIND_LABEL[String(r.kind)] ?? r.kind ?? 'Signalé')}</span>
                <span style={{ color: 'var(--text-muted)' }}>{new Date(r.created_at).toLocaleString('fr-FR')}</span>
                <span style={{ color: 'var(--text-muted)' }}>{r.platform ?? '—'}{r.app_version ? ` · ${r.app_version}` : ''}</span>
                {r.username ? <span style={{ color: 'var(--text-muted)' }}>@{r.username}</span> : null}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{short}</div>
              {r.message.length > 110 ? (
                <button className="btn" onClick={() => setOpen((p) => ({ ...p, [r.id]: !expanded }))} style={{ justifySelf: 'start', background: 'transparent', border: 'none', color: 'var(--primary-light)', fontWeight: 800, padding: 0 }}>
                  {expanded ? 'Réduire' : 'En savoir plus'}
                </button>
              ) : null}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
                {r.status !== 'SEEN' ? <button className="btn" disabled={busy === r.id} onClick={() => void setStatus(r.id, 'SEEN')} style={{ minHeight: 38 }}>👁 Vu</button> : null}
                {r.status !== 'FIXED' ? <button className="btn" disabled={busy === r.id} onClick={() => void setStatus(r.id, 'FIXED')} style={{ minHeight: 38, background: '#38D990', color: '#0B1F16', border: 'none' }}>✓ Corrigé</button> : null}
                {r.status !== 'NEW' ? <button className="btn" disabled={busy === r.id} onClick={() => void setStatus(r.id, 'NEW')} style={{ minHeight: 38 }}>↺ À revoir</button> : null}
              </div>
            </div>
          );
        })}
      </div>
    </AdminLayout>
  );
}
