import React, { useCallback, useEffect, useRef, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import Hint from '../components/Hint';
import { supabase } from '../lib/supabaseClient';
import { commitLink, LEDGER_URL, testLink, validSha, validTestPath } from '../lib/releaseEvidence';
import { problemReportIssueUrl } from '../lib/problemReportIssue';

// Super Admin › Modération › Signalements (06/10/2026) : les « secousses » et diagnostics automatiques de l'app
// (table app_problem_reports) étaient invisibles. Lecture via admin_problem_reports (rôles de modération uniquement).
type Report = {
  id: string; created_at: string; kind: string | null; status: 'NEW' | 'SEEN' | 'FIXED'; message: string;
  screen: string | null; platform: string | null; app_version: string | null;
  fixed_in_sha: string | null; regression_test_path: string | null;
  group_key: string; report_count: number;
};
type Filter = 'NEW' | 'SEEN' | 'FIXED' | 'ALL';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'NEW', label: 'Nouveaux' },
  { key: 'SEEN', label: 'En cours' },
  { key: 'FIXED', label: 'Corrigés' },
  { key: 'ALL', label: 'Tous' },
];
const KIND_LABEL: Record<string, string> = { SHAKE: '📳 Secousse', MANUAL: '✍️ Signalé' };
const isAuto = (message: string) => message.startsWith('[AUTO]');

export default function ProblemReports() {
  const [filter, setFilter] = useState<Filter>('NEW');
  const [rows, setRows] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [sha, setSha] = useState('');
  const [testPath, setTestPath] = useState('');
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true); setError('');
    try {
      if (!supabase) throw new Error('Supabase Super Admin non configuré.');
      const { data, error: rpcError } = await supabase.rpc('admin_problem_report_groups', { p_status: filter, p_limit: 300 });
      if (rpcError) throw new Error('Signalements indisponibles · droits ou migration serveur à vérifier');
      if (!Array.isArray(data)) throw new Error('Réponse serveur invalide.');
      if (sequence === requestSequence.current) setRows(data as Report[]);
    } catch (e: any) {
      if (sequence === requestSequence.current) { setError(e.message ?? 'Lecture impossible.'); setRows([]); }
    } finally { if (sequence === requestSequence.current) setLoading(false); }
  }, [filter]);

  useEffect(() => { void load(); return () => { requestSequence.current++; }; }, [load]);

  const setStatus = async (groupKey: string, status: 'SEEN' | 'NEW') => {
    if (!supabase) return;
    setBusy(groupKey);
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_problem_report_group_set_status', { p_group_key: groupKey, p_status: status });
      if (rpcError || !(Number(data) > 0)) throw new Error('Statut non enregistré.');
      void load();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(null); }
  };

  const recordFix = async (groupKey: string) => {
    if (!supabase || !validSha(sha.trim()) || !validTestPath(testPath.trim())) {
      setError('SHA complet et chemin de test du dépôt requis.'); return;
    }
    setBusy(groupKey); setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_problem_report_group_set_status', {
        p_group_key: groupKey, p_status: 'FIXED', p_sha: sha.trim(), p_test: testPath.trim(),
      });
      if (rpcError || !(Number(data) > 0)) throw new Error('Correctif non enregistré · droits ou migration à vérifier');
      setEditing(null); void load();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(null); }
  };

  return (
    <AdminLayout>
      <div className="page-title">Bugs <Hint title="Bugs" text={<>Secousses et erreurs de l’app</>}/></div>
      <div style={{ marginBottom: 14 }}><Hint title="Liste" text={<><p>300 groupes maximum, triés par nombre de signalements. Même écran et message normalisé (casse, ponctuation, identifiants variables). Le compteur couvre tous les rapports du groupe. Corrigé signifie SHA et test associés, jamais livraison ou test réussi.</p>
        <a href={LEDGER_URL} target="_blank" rel="noopener noreferrer">Registre anti-régression</a></>}/></div>

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

      <div style={{ display: 'grid', gap: 10 }}>
        {rows.map((r) => {
          const expanded = Boolean(open[r.group_key]);
          const short = r.message.length > 110 && !expanded ? `${r.message.slice(0, 110)}…` : r.message;
          return (
            <div key={r.group_key} className="card" style={{ display: 'grid', gap: 8, marginBottom: 0 }}>
              <strong>{r.screen || 'Écran inconnu'} · {r.report_count} signalement(s) · {r.status === 'SEEN' ? 'EN COURS' : r.status === 'FIXED' ? 'CORRIGÉ' : r.status}</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 12, fontWeight: 800 }}>
                <span>{isAuto(r.message) ? '🤖 Auto' : (KIND_LABEL[String(r.kind)] ?? r.kind ?? 'Signalé')}</span>
                <span style={{ color: 'var(--text-muted)' }}>{new Date(r.created_at).toLocaleString('fr-FR')}</span>
                <span style={{ color: 'var(--text-muted)' }}>{r.platform ?? '—'}{r.app_version ? ` · ${r.app_version}` : ''}</span>
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{short}</div>
              <details style={{ overflowWrap: 'anywhere' }}><summary>Correctif & test</summary>
                {commitLink(r.fixed_in_sha) ? <a href={commitLink(r.fixed_in_sha)!} target="_blank" rel="noopener noreferrer">Commit {r.fixed_in_sha}</a> : <span>SHA non associé</span>}
                <div>{testLink(r.fixed_in_sha, r.regression_test_path) ? <a href={testLink(r.fixed_in_sha, r.regression_test_path)!} target="_blank" rel="noopener noreferrer">Test anti-régression</a> : 'Test non associé'}</div>
                <div>Livraison et exécution du test à vérifier</div>
              </details>
              {r.message.length > 110 ? (
                <button className="btn" onClick={() => setOpen((p) => ({ ...p, [r.group_key]: !expanded }))} style={{ justifySelf: 'start', background: 'transparent', border: 'none', color: 'var(--primary-light)', fontWeight: 800, padding: 0 }}>
                  {expanded ? 'Réduire' : 'En savoir plus'}
                </button>
              ) : null}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
                {r.status !== 'SEEN' ? <button className="btn" disabled={busy !== null} onClick={() => void setStatus(r.group_key, 'SEEN')} style={{ minHeight: 38 }}>En cours</button> : null}
                <button className="btn" disabled={busy !== null} onClick={() => { setEditing(r.group_key); setSha(r.fixed_in_sha ?? ''); setTestPath(r.regression_test_path ?? ''); }} style={{ minHeight: 38, background: '#38D990', color: '#0B1F16', border: 'none' }}>{r.status === 'FIXED' ? 'Associer preuves' : '✓ Corrigé'}</button>
                {r.status !== 'NEW' ? <button className="btn" disabled={busy !== null} onClick={() => void setStatus(r.group_key, 'NEW')} style={{ minHeight: 38 }}>↺ À revoir</button> : null}
                {problemReportIssueUrl(r) ? <a className="btn" href={problemReportIssueUrl(r)!} target="_blank" rel="noopener noreferrer">Créer une issue Copilot</a> : null}
              </div>
              {editing === r.group_key ? <form onSubmit={e => { e.preventDefault(); void recordFix(r.group_key); }} style={{ display: 'grid', gap: 10, minWidth: 0 }}>
                <label>SHA complet<input aria-label="SHA du correctif" value={sha} onChange={e => setSha(e.target.value)} maxLength={40} required style={{ width: '100%', boxSizing: 'border-box' }} /></label>
                <label>Chemin du test<input aria-label="Chemin du test anti-régression" value={testPath} onChange={e => setTestPath(e.target.value)} required style={{ width: '100%', boxSizing: 'border-box' }} /></label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" type="submit" disabled={busy !== null || !validSha(sha.trim()) || !validTestPath(testPath.trim())}>Enregistrer preuves</button>
                  <button className="btn" type="button" disabled={busy !== null} onClick={() => setEditing(null)}>Annuler</button>
                </div>
              </form> : null}
            </div>
          );
        })}
      </div>
    </AdminLayout>
  );
}
