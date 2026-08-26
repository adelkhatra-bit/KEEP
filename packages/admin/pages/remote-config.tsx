import React, { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';

interface RemoteConfigRow {
  key: string;
  value: unknown;
  description: string | null;
  updated_at?: string | null;
}

function editableValue(row: RemoteConfigRow) {
  return typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
}

export default function RemoteConfig() {
  const [rows, setRows] = useState<RemoteConfigRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!supabase) throw new Error('Supabase Super Admin non configuré.');
      const { data, error: rpcError } = await supabase.rpc('admin_remote_config_list');
      if (rpcError) throw rpcError;
      setRows((data ?? []) as RemoteConfigRow[]);
    } catch (e: any) {
      setError(e?.message ?? 'Échec du chargement de la configuration.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const draftFor = (row: RemoteConfigRow) => drafts[row.key] ?? editableValue(row);

  const save = async (row: RemoteConfigRow) => {
    if (!supabase) return;
    setSavingKey(row.key);
    setError(null);
    try {
      const raw = draftFor(row);
      let value: unknown = raw;
      if (typeof row.value !== 'string') {
        try { value = JSON.parse(raw); }
        catch { throw new Error('Valeur JSON invalide.'); }
      }
      const { error: rpcError } = await supabase.rpc('admin_remote_config_set', {
        p_key: row.key,
        p_value: value,
        p_description: row.description,
      });
      if (rpcError) throw rpcError;
      setSavedNote((n) => ({ ...n, [row.key]: `Enregistré à ${new Date().toLocaleTimeString('fr-FR')}` }));
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Échec de l'enregistrement.");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <AdminLayout>
      <div className="page-title">Textes & Quotas app</div>
      <div className="page-subtitle">Modifie directement la configuration KEEP stockée dans Supabase — aucun serveur local ni redéploiement requis.</div>

      {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
      {!error && !loading && <div className="demo-banner">● MODE RÉEL — accès réservé aux Admin actifs, écriture auditée dans Supabase.</div>}
      {loading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Chargement…</p>}

      {!loading && rows.length > 0 && (
        <table>
          <thead>
            <tr><th>Clé</th><th>Valeur</th><th>Description</th><th>Action</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{row.key}</td>
                <td>
                  {typeof row.value === 'string' && row.value.length > 60 ? (
                    <textarea
                      value={draftFor(row)}
                      onChange={(e) => setDrafts((d) => ({ ...d, [row.key]: e.target.value }))}
                      rows={2}
                      style={{ width: '100%', minWidth: 320, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '8px 10px', fontSize: 13 }}
                    />
                  ) : (
                    <input
                      type={typeof row.value === 'number' ? 'number' : 'text'}
                      value={draftFor(row)}
                      onChange={(e) => setDrafts((d) => ({ ...d, [row.key]: e.target.value }))}
                      style={{ width: '100%', minWidth: 220, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '8px 10px', fontSize: 13 }}
                    />
                  )}
                </td>
                <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{row.description}</td>
                <td>
                  <button
                    onClick={() => void save(row)}
                    disabled={savingKey === row.key}
                    style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    {savingKey === row.key ? '…' : 'Enregistrer'}
                  </button>
                  {savedNote[row.key] && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{savedNote[row.key]}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminLayout>
  );
}
