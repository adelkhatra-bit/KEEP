import React, { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';

type FeatureFlagRow = {
  key: string;
  description: string | null;
  is_enabled_globally: boolean;
};

export default function FeatureFlags() {
  const [flags, setFlags] = useState<FeatureFlagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const load = async () => {
    if (!supabase) {
      setError('Supabase Super Admin non configuré.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: flagRows, error: flagError } = await supabase.from('feature_flags').select('key,description,is_enabled_globally').order('key');
      if (flagError) throw flagError;
      setFlags((flagRows ?? []) as FeatureFlagRow[]);
    } catch (e: any) {
      setError(e?.message ?? 'Échec du chargement des Feature Flags.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const toggle = async (flag: FeatureFlagRow) => {
    if (!supabase || busyKey) return;
    const next = !flag.is_enabled_globally;
    setBusyKey(flag.key);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('admin_feature_flag_set', {
        p_key: flag.key,
        p_enabled: next,
      });
      if (rpcError) throw rpcError;
      setFlags((rows) => rows.map((row) => row.key === flag.key ? { ...row, is_enabled_globally: next } : row));
      setSavedAt(new Date().toLocaleTimeString('fr-FR'));
    } catch (e: any) {
      setError(e?.message ?? "Échec de l'enregistrement du Feature Flag.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <AdminLayout>
      <div className="page-title">Feature Flags</div>
      <div className="page-subtitle">Activation globale des fonctionnalités — Supabase réel</div>

      {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
      {!error && !loading && <div className="demo-banner">● MODE RÉEL — les changements sont persistés dans Supabase et tracés dans `audit_logs`.</div>}
      {loading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Chargement…</p>}

      {!loading && <table>
        <thead>
          <tr><th>Fonctionnalité</th><th>Clé</th><th>Statut</th><th></th></tr>
        </thead>
        <tbody>
          {flags.map((f) => (
            <tr key={f.key}>
              <td>{f.description || f.key}</td>
              <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 12 }}>{f.key}</td>
              <td>
                <span style={{ color: f.is_enabled_globally ? 'var(--keep)' : 'var(--text-muted)', fontWeight: 600 }}>
                  {f.is_enabled_globally ? 'Activé' : 'Désactivé'}
                </span>
              </td>
              <td>
                <button
                  onClick={() => void toggle(f)}
                  disabled={busyKey !== null}
                  style={{
                    background: f.is_enabled_globally ? 'rgba(255,92,114,0.12)' : 'rgba(45,225,194,0.12)',
                    border: `1px solid ${f.is_enabled_globally ? 'var(--pass)' : 'var(--keep)'}`,
                    color: f.is_enabled_globally ? 'var(--pass)' : 'var(--keep)',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: busyKey ? 'wait' : 'pointer',
                    opacity: busyKey && busyKey !== f.key ? 0.45 : 1,
                  }}
                >
                  {busyKey === f.key ? '…' : f.is_enabled_globally ? 'Désactiver' : 'Activer'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>}
      {/* Adel (08/09/2026) : "verifie bien que dans toutes ces rubriques
          tu n'as pas cree des doublons" -- le reglage "Silence avant
          proposition d'arret" dupliquait exactement Textes & Quotas app
          (meme cle admin_remote_config, groupe "Ecouter & compte"). */}
      {savedAt && <p className="save-hint">Enregistré dans Supabase à {savedAt}.</p>}
    </AdminLayout>
  );
}
