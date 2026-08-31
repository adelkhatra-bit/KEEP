import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';

type BrainStats = {
  tracks_total?: number;
  tracks_with_genres?: number;
  tracks_without_genres?: number;
  kept_total?: number;
  smart_albums?: number;
  smart_memberships?: number;
  top_genres?: Array<{ genre: string; count: number }>;
  engine_mode?: string;
  external_api_required?: boolean;
};

type BrainConfig = {
  enabled: boolean;
  auto_create: boolean;
  min_tracks: number;
  max_albums: number;
  allow_rename: boolean;
  taxonomy_version: number;
};

const DEFAULT_CONFIG: BrainConfig = {
  enabled: true,
  auto_create: true,
  min_tracks: 2,
  max_albums: 10,
  allow_rename: true,
  taxonomy_version: 1,
};

export default function MusicBrain() {
  const [stats, setStats] = useState<BrainStats>({});
  const [config, setConfig] = useState<BrainConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const coverage = useMemo(() => {
    const total = Number(stats.tracks_total ?? 0);
    const withGenres = Number(stats.tracks_with_genres ?? 0);
    return total > 0 ? Math.round((withGenres / total) * 100) : 0;
  }, [stats.tracks_total, stats.tracks_with_genres]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      if (!supabase) throw new Error('Supabase Super Admin non configuré.');
      const [statsRes, configRes] = await Promise.all([
        supabase.rpc('admin_music_brain_stats'),
        supabase.rpc('admin_remote_config_list'),
      ]);
      if (statsRes.error) throw statsRes.error;
      if (configRes.error) throw configRes.error;
      setStats((statsRes.data ?? {}) as BrainStats);
      const row = (configRes.data ?? []).find((item: any) => item.key === 'smart_album_config');
      if (row?.value && typeof row.value === 'object') setConfig({ ...DEFAULT_CONFIG, ...row.value });
    } catch (e: any) {
      setError(e?.message ?? 'Impossible de charger Loki Music Brain.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!supabase || saving) return;
    setSaving(true);
    setError('');
    setSaved('');
    try {
      const { error: saveError } = await supabase.rpc('admin_remote_config_set', {
        p_key: 'smart_album_config',
        p_value: config,
        p_description: 'Cerveau musical Loki : création locale des albums intelligents sans clé API externe.',
      });
      if (saveError) throw saveError;
      setSaved(`Configuration enregistrée à ${new Date().toLocaleTimeString('fr-FR')}`);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Impossible d'enregistrer la configuration.");
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: keyof Pick<BrainConfig, 'enabled' | 'auto_create' | 'allow_rename'>) => {
    setConfig((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <AdminLayout>
      <div className="page-title">Loki Music Brain</div>
      <div className="page-subtitle">Classement automatique propriétaire : Vibes, styles et collections Loki. Aucune clé API externe n’est requise pour le moteur de rangement.</div>

      {error ? <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div> : null}
      {!error && !loading ? <div className="demo-banner">● MODE RÉEL — paramètres distants, statistiques Supabase et journalisation Admin.</div> : null}

      <div className="cards" style={{ marginTop: 16 }}>
        <Metric label="Titres connus" value={stats.tracks_total ?? 0} />
        <Metric label="Styles exploitables" value={`${coverage}%`} />
        <Metric label="Morceaux enregistrés" value={stats.kept_total ?? 0} />
        <Metric label="Vibes intelligentes" value={stats.smart_albums ?? 0} />
        <Metric label="Titres rangés" value={stats.smart_memberships ?? 0} />
        <Metric label="API externe rangement" value={stats.external_api_required === false ? 'NON' : '—'} />
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>Pilotage automatique</h2>
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>Le moteur crée des Vibes Loki à partir des styles déjà connus, les met à jour après les morceaux gardés et laisse toujours l’utilisateur renommer et choisir Public/Privé.</p>
        <div style={grid}>
          <Toggle label="Music Brain actif" value={config.enabled} onClick={() => toggle('enabled')} />
          <Toggle label="Créer automatiquement" value={config.auto_create} onClick={() => toggle('auto_create')} />
          <Toggle label="Renommage utilisateur" value={config.allow_rename} onClick={() => toggle('allow_rename')} />
          <NumberField label="Minimum de titres par Vibe" value={config.min_tracks} min={1} max={20} onChange={(value) => setConfig((c) => ({ ...c, min_tracks: value }))} />
          <NumberField label="Maximum de Vibes automatiques" value={config.max_albums} min={1} max={30} onChange={(value) => setConfig((c) => ({ ...c, max_albums: value }))} />
          <NumberField label="Version taxonomie" value={config.taxonomy_version} min={1} max={99} onChange={(value) => setConfig((c) => ({ ...c, taxonomy_version: value }))} />
        </div>
        <button onClick={() => void save()} disabled={saving} style={primaryButton}>{saving ? 'ENREGISTREMENT…' : 'ENREGISTRER LE CERVEAU LOKI'}</button>
        {saved ? <div style={{ color: '#86efac', marginTop: 10, fontSize: 12 }}>{saved}</div> : null}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>Styles dominants détectés</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(stats.top_genres ?? []).length ? (stats.top_genres ?? []).map((item) => (
            <span key={item.genre} style={chip}>{item.genre} · {item.count}</span>
          )) : <span style={{ color: 'var(--text-muted)' }}>Pas encore assez de métadonnées de style.</span>}
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5, marginBottom: 0 }}>Moteur actuel : {stats.engine_mode ?? 'KEEP_LOCAL_METADATA'}. La prochaine couche pourra enrichir les morceaux sans style par analyse locale/open source, sans facturation par reconnaissance.</p>
      </div>
    </AdminLayout>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="card"><div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{label}</div><div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{value}</div></div>;
}

function Toggle({ label, value, onClick }: { label: string; value: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} style={{ ...control, borderColor: value ? '#7c3aed' : 'var(--border)' }}><span>{label}</span><strong style={{ color: value ? '#86efac' : '#fca5a5' }}>{value ? 'ON' : 'OFF'}</strong></button>;
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label style={control}><span>{label}</span><input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))} style={numberInput} /></label>;
}

const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 };
const control: React.CSSProperties = { minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontWeight: 700 };
const numberInput: React.CSSProperties = { width: 72, background: '#0d0a13', color: '#fff', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 8px' };
const primaryButton: React.CSSProperties = { marginTop: 14, minHeight: 44, border: 0, borderRadius: 999, background: '#7c3aed', color: '#fff', padding: '0 18px', fontWeight: 900, cursor: 'pointer' };
const chip: React.CSSProperties = { padding: '7px 10px', borderRadius: 999, background: 'rgba(124,58,237,.16)', border: '1px solid rgba(167,139,250,.35)', color: '#d8c7ff', fontSize: 12, fontWeight: 800 };
