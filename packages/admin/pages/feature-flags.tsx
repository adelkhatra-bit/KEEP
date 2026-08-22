import React, { useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { DEMO_FEATURE_FLAGS, DemoFeatureFlag, DEMO_APP_SETTINGS, DemoAppSetting } from '../lib/demoData';

/**
 * Écran Feature Flags — cf. cahier des charges "TOUT DOIT ÊTRE MODIFIABLE"
 * et RESTE_A_FAIRE.md Priorité 4. Reflète `feature_flags`
 * (supabase/migrations/0007_seed_defaults.sql), y compris `keep_dna`
 * désactivé par défaut -- ne jamais l'activer par défaut ici sans que ce
 * soit aussi le cas côté base de données.
 */
export default function FeatureFlags() {
  const [flags, setFlags] = useState<DemoFeatureFlag[]>(DEMO_FEATURE_FLAGS);
  const [settings, setSettings] = useState<DemoAppSetting[]>(DEMO_APP_SETTINGS);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const toggle = (key: string) => {
    setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, isEnabledGlobally: !f.isEnabledGlobally } : f)));
    setSavedAt(null);
  };

  const updateSetting = (key: string, value: number) => {
    setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, value } : s)));
    setSavedAt(null);
  };

  const handleSave = () => {
    // MODE DÉMO : pas d'écriture réelle. En Mode Réel, PATCH /admin/feature-flags
    // qui écrit dans `feature_flags` + une ligne `audit_logs` par changement.
    // Les réglages numériques (DEMO_APP_SETTINGS) n'ont pas encore de table
    // `app_settings` équivalente — voir le commentaire dans lib/demoData.ts.
    setSavedAt(new Date().toLocaleTimeString('fr-FR'));
  };

  return (
    <AdminLayout>
      <div className="page-title">Feature Flags</div>
      <div className="page-subtitle">Activation globale des fonctionnalités — France</div>

      <div className="demo-banner">
        🎭 MODE DÉMO — modification en mémoire uniquement (perdue au
        rafraîchissement). En Mode Réel, chaque changement sera tracé dans
        `audit_logs` (qui l'a fait, avant/après).
      </div>

      <table>
        <thead>
          <tr><th>Fonctionnalité</th><th>Clé</th><th>Statut</th><th></th></tr>
        </thead>
        <tbody>
          {flags.map((f) => (
            <tr key={f.key}>
              <td>{f.description}</td>
              <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 12 }}>{f.key}</td>
              <td>
                <span style={{ color: f.isEnabledGlobally ? 'var(--keep)' : 'var(--text-muted)', fontWeight: 600 }}>
                  {f.isEnabledGlobally ? 'Activé' : 'Désactivé'}
                </span>
              </td>
              <td>
                <button
                  onClick={() => toggle(f.key)}
                  style={{
                    background: f.isEnabledGlobally ? 'rgba(255,92,114,0.12)' : 'rgba(45,225,194,0.12)',
                    border: `1px solid ${f.isEnabledGlobally ? 'var(--pass)' : 'var(--keep)'}`,
                    color: f.isEnabledGlobally ? 'var(--pass)' : 'var(--keep)',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {f.isEnabledGlobally ? 'Désactiver' : 'Activer'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

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
                  onChange={(e) => updateSetting(s.key, Math.max(1, Number(e.target.value) || 1))}
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
        onClick={handleSave}
        style={{
          marginTop: 20,
          background: 'var(--primary)',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '10px 20px',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Enregistrer
      </button>
      {savedAt && <p className="save-hint">Enregistré (Mode Démo) à {savedAt} — non persisté, aucun backend connecté.</p>}
    </AdminLayout>
  );
}
