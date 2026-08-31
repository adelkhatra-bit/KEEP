import React, { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';

type FeatureFlagRow = {
  key: string;
  description: string | null;
  is_enabled_globally: boolean;
};

type RemoteConfigRow = {
  key: string;
  value: unknown;
  description: string | null;
};

type AppSetting = {
  key: string;
  description: string;
  value: number;
  unit: string;
};

const SESSION_SETTING_KEY = 'session_silence_timeout_minutes';

export default function FeatureFlags() {
  const [flags, setFlags] = useState<FeatureFlagRow[]>([]);
  const [settings, setSettings] = useState<AppSetting[]>([]);
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
      const [{ data: flagRows, error: flagError }, { data: configRows, error: configError }] = await Promise.all([
        supabase.from('feature_flags').select('key,description,is_enabled_globally').order('key'),
        supabase.rpc('admin_remote_config_list'),
      ]);
      if (flagError) throw flagError;
      if (configError) throw configError;

      setFlags((flagRows ?? []) as FeatureFlagRow[]);
      const config = ((configRows ?? []) as RemoteConfigRow[]).find((row) => row.key === SESSION_SETTING_KEY);
      const timeout = Number(config?.value);
      setSettings([{
        key: SESSION_SETTING_KEY,
        description: config?.description || 'Fin de session proposée après une absence de musique de',
        value: Number.isFinite(timeout) && timeout > 0 ? timeout : 10,
        unit: 'minutes',
      }]);
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

  const updateSetting = (key: string, value: number) => {
    setSettings((prev) => prev.map((s) => s.key === key ? { ...s, value } : s));
    setSavedAt(null);
  };

  const saveSettings = async () => {
    if (!supabase || busyKey) return;
    const setting = settings.find((row) => row.key === SESSION_SETTING_KEY);
    if (!setting) return;
    setBusyKey(setting.key);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('admin_remote_config_set', {
        p_key: setting.key,
        p_value: setting.value,
        p_description: setting.description,
      });
      if (rpcError) throw rpcError;
      setSavedAt(new Date().toLocaleTimeString('fr-FR'));
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Échec de l'enregistrement du réglage.");
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

      {!loading && <>
        <div className="page-subtitle" style={{ marginTop: 32 }}>Réglages session</div>
        <table>
          <thead>
            <tr><th>Réglage</th><th>Clé</th><th>Valeur</th></tr>
          </thead>
          <tbody>
            {settings.map((s) => (
              <tr key={s.key}>
                <td>{s.description}</td>
                <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 12 }}>{s.key}</td>
                <td>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={s.value}
                    onChange={(e) => updateSetting(s.key, Math.min(120, Math.max(1, Number(e.target.value) || 1)))}
                    style={{
                      width: 64, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                      borderRadius: 6, color: 'var(--text-primary)', padding: '6px 8px', fontSize: 13,
                    }}
                  />{' '}
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{s.unit}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button
          onClick={() => void saveSettings()}
          disabled={busyKey !== null}
          style={{
            marginTop: 20,
            background: 'var(--primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '10px 20px',
            fontWeight: 700,
            cursor: busyKey ? 'wait' : 'pointer',
          }}
        >
          {busyKey === SESSION_SETTING_KEY ? 'Enregistrement…' : 'Enregistrer le réglage'}
        </button>
      </>}
      {savedAt && <p className="save-hint">Enregistré dans Supabase à {savedAt}.</p>}
    </AdminLayout>
  );
}
