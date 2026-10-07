import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import Hint from '../components/Hint';
import { supabase } from '../lib/supabaseClient';

type PlanCode = 'FREE' | 'PREMIUM' | 'CREATOR_PRO' | 'VENUE_PRO';
type Rule = {
  notification_type: string;
  is_locked: boolean;
  min_plan_code: PlanCode;
  created_at: string;
  updated_at: string;
};

const PLANS: Array<{ code: PlanCode; label: string }> = [
  { code: 'FREE', label: 'FREE' },
  { code: 'PREMIUM', label: 'Premium' },
  { code: 'CREATOR_PRO', label: 'Creator Pro' },
  { code: 'VENUE_PRO', label: 'Venue Pro' },
];

function prettyType(value: string) {
  return value
    .replace(/^KEEP_/, '')
    .replace(/^AGORA_/, 'TCHAT · ')
    .replace(/^CHAT_/, 'TCHAT · ')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (s) => s.toUpperCase());
}

export default function NotificationAccessPage() {
  const [rows, setRows] = useState<Rule[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    if (!supabase) return;
    setError('');
    const { data, error: loadError } = await supabase
      .from('notification_access_rules')
      .select('notification_type,is_locked,min_plan_code,created_at,updated_at')
      .order('notification_type', { ascending: true });
    if (loadError) {
      setError(loadError.message || 'Impossible de charger les règles.');
      return;
    }
    setRows((data ?? []) as Rule[]);
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      row.notification_type.toLowerCase().includes(needle) ||
      prettyType(row.notification_type).toLowerCase().includes(needle)
    );
  }, [rows, query]);

  const updateRule = async (row: Rule, patch: Partial<Pick<Rule, 'is_locked' | 'min_plan_code'>>) => {
    if (!supabase || busy) return;
    const next = { ...row, ...patch };
    setBusy(row.notification_type);
    setError('');
    setNotice('');
    setRows((current) => current.map((item) => item.notification_type === row.notification_type ? next : item));
    const { error: updateError } = await supabase
      .from('notification_access_rules')
      .update({
        is_locked: next.is_locked,
        min_plan_code: next.is_locked ? next.min_plan_code : 'FREE',
        updated_at: new Date().toISOString(),
      })
      .eq('notification_type', row.notification_type);

    if (updateError) {
      setRows((current) => current.map((item) => item.notification_type === row.notification_type ? row : item));
      setError(updateError.message || 'Impossible d’enregistrer cette règle.');
    } else {
      setRows((current) => current.map((item) =>
        item.notification_type === row.notification_type
          ? { ...next, min_plan_code: next.is_locked ? next.min_plan_code : 'FREE', updated_at: new Date().toISOString() }
          : item
      ));
      setNotice(`${prettyType(row.notification_type)} mis à jour.`);
    }
    setBusy(null);
  };

  const lockedCount = rows.filter((row) => row.is_locked).length;

  return (
    <AdminLayout>
      <div className="page-title">Notifications <Hint title="Notifications" text={<>Verrouille chaque type de notification et choisis la formule minimale. L’utilisateur voit un cadenas et une explication, sans révéler le contenu privé.</>}/></div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 22 }}>
        <div className="kpi-card" style={{ minWidth: 150 }}>
          <div style={{ fontSize: 26, fontWeight: 900 }}>{rows.length}</div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>types détectés</div>
        </div>
        <div className="kpi-card" style={{ minWidth: 150 }}>
          <div style={{ fontSize: 26, fontWeight: 900 }}>{lockedCount}</div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>verrouillés</div>
        </div>
      </div>

      <div className="kpi-card" style={{ marginTop: 16 }}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher un type de notification…"
          style={{ width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
        />
        <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 }}>
          Tout nouveau type de notification est enregistré automatiquement et reste déverrouillé par défaut jusqu’à ce que tu décides de le réserver.
        </div>
        {error ? <div style={{ marginTop: 12, color: '#fb7185', fontWeight: 800 }}>{error}</div> : null}
        {notice ? <div style={{ marginTop: 12, color: '#86efac', fontWeight: 800 }}>{notice}</div> : null}
      </div>

      <div className="kpi-card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 12 }}>
              <th style={{ padding: '10px 8px' }}>Notification</th>
              <th style={{ padding: '10px 8px' }}>Code</th>
              <th style={{ padding: '10px 8px' }}>Cadenas</th>
              <th style={{ padding: '10px 8px' }}>Formule minimale</th>
              <th style={{ padding: '10px 8px' }}>Effet utilisateur</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const saving = busy === row.notification_type;
              return (
                <tr key={row.notification_type} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 8px', fontWeight: 900 }}>{prettyType(row.notification_type)}</td>
                  <td style={{ padding: '12px 8px', color: 'var(--muted)', fontSize: 11 }}>{row.notification_type}</td>
                  <td style={{ padding: '12px 8px' }}>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void updateRule(row, { is_locked: !row.is_locked, min_plan_code: row.is_locked ? 'FREE' : (row.min_plan_code === 'FREE' ? 'PREMIUM' : row.min_plan_code) })}
                      style={{
                        minWidth: 112,
                        padding: '9px 12px',
                        borderRadius: 999,
                        border: `1px solid ${row.is_locked ? '#fb7185' : '#86efac'}`,
                        background: row.is_locked ? 'rgba(251,113,133,.12)' : 'rgba(134,239,172,.10)',
                        color: row.is_locked ? '#fb7185' : '#86efac',
                        fontWeight: 900,
                        cursor: saving ? 'wait' : 'pointer',
                      }}
                    >
                      {saving ? '…' : row.is_locked ? '🔒 BLOQUÉ' : '🔓 LIBRE'}
                    </button>
                  </td>
                  <td style={{ padding: '12px 8px' }}>
                    <select
                      value={row.is_locked ? row.min_plan_code : 'FREE'}
                      disabled={!row.is_locked || saving}
                      onChange={(event) => void updateRule(row, { min_plan_code: event.target.value as PlanCode, is_locked: true })}
                      style={{ minWidth: 150, padding: '9px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                    >
                      {PLANS.filter((plan) => plan.code !== 'FREE').map((plan) => <option key={plan.code} value={plan.code}>{plan.label}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '12px 8px', color: 'var(--muted)', fontSize: 12 }}>
                    {row.is_locked ? `Cadenas + popup « Disponible avec ${PLANS.find((p) => p.code === row.min_plan_code)?.label ?? row.min_plan_code} »` : 'Notification visible normalement'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filtered.length ? <div style={{ padding: 20, color: 'var(--muted)' }}>Aucun type ne correspond à cette recherche.</div> : null}
      </div>
    </AdminLayout>
  );
}
