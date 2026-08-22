import React, { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import DataModeBanner from '../components/DataModeBanner';
import { DEMO_FEATURE_FLAGS, DemoFeatureFlag, DEMO_APP_SETTINGS, DemoAppSetting } from '../lib/demoData';
import { useLiveOrDemo } from '../lib/useLiveOrDemo';
import { adminApi, AdminApiError } from '../lib/apiClient';

interface RawFeatureFlag {
  key: string;
  description: string | null;
  is_enabled_globally: boolean;
}

function mapFlags(raw: RawFeatureFlag[]): DemoFeatureFlag[] {
  return raw.map((f) => ({ key: f.key, description: f.description ?? f.key, isEnabledGlobally: f.is_enabled_globally }));
}

/**
 * Écran Feature Flags -- cf. cahier des charges "TOUT DOIT ÊTRE MODIFIABLE"
 * et RESTE_A_FAIRE.md Priorité 4. En Mode Réel (NEXT_PUBLIC_API_URL +
 * Supabase configurés côté admin ET backend), lit/écrit réellement
 * `feature_flags` via PATCH /api/admin/feature-flags/:key (voir
 * packages/backend/src/routes/admin.ts), avec audit_log serveur. Repli
 * honnête en Mode Démo sinon (voir lib/useLiveOrDemo.ts) -- jamais de faux
 * "enregistré" si l'écriture réelle a échoué.
 *
 * `DEMO_APP_SETTINGS` (durée de silence de session) reste Mode Démo pur :
 * aucune table `app_settings` n'existe encore côté backend (voir
 * lib/demoData.ts) -- ne pas prétendre le contraire.
 */
export default function FeatureFlags() {
  const flagsResult = useLiveOrDemo('/feature-flags', mapFlags, DEMO_FEATURE_FLAGS);
  const [flags, setFlags] = useState<DemoFeatureFlag[]>(DEMO_FEATURE_FLAGS);
  const [settings, setSettings] = useState<DemoAppSetting[]>(DEMO_APP_SETTINGS);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFlags(flagsResult.data);
  }, [flagsResult.data]);

  const toggle = (key: string) => {
    setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, isEnabledGlobally: !f.isEnabledGlobally } : f)));
    setSavedAt(null);
    setSaveError(null);
  };

  const updateSetting = (key: string, value: number) => {
    setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, value } : s)));
    setSavedAt(null);
  };

  const handleSave = async () => {
    if (flagsResult.mode !== 'live') {
      // MODE DÉMO : pas d'écriture réelle possible (pas de backend connecté).
      setSavedAt(new Date().toLocaleTimeString('fr-FR'));
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const changed = flags.filter((f) => {
        const original = flagsResult.data.find((o) => o.key === f.key);
        return original && original.isEnabledGlobally !== f.isEnabledGlobally;
      });
      for (const f of changed) {
        await adminApi.patch(`/feature-flags/${f.key}`, { is_enabled_globally: f.isEnabledGlobally });
      }
      setSavedAt(new Date().toLocaleTimeString('fr-FR'));
      flagsResult.refresh();
    } catch (e) {
      setSaveError(e instanceof AdminApiError ? `${e.message} (HTTP ${e.status})` : 'Échec de l’enregistrement.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="page-title">Feature Flags</div>
      <div className="page-subtitle">Activation globale des fonctionnalités — France</div>

      <DataModeBanner
        mode={flagsResult.mode}
        loading={flagsResult.loading}
        reason={flagsResult.reason}
        demoNote="modification en mémoire uniquement (perdue au rafraîchissement)."
      />

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
      <p className="save-hint" style={{ marginTop: -12, marginBottom: 12 }}>
        Pas encore de table `app_settings` côté backend — reste Mode Démo pur quel que soit l'état de connexion ci-dessus.
      </p>
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
        disabled={saving}
        style={{
          marginTop: 20,
          background: 'var(--primary)',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '10px 20px',
          fontWeight: 700,
          cursor: saving ? 'default' : 'pointer',
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? 'Enregistrement…' : 'Enregistrer'}
      </button>
      {saveError && <p className="save-hint" style={{ color: 'var(--pass)' }}>{saveError}</p>}
      {savedAt && !saveError && (
        <p className="save-hint">
          {flagsResult.mode === 'live'
            ? `Enregistré (backend réel) à ${savedAt}.`
            : `Enregistré (Mode Démo) à ${savedAt} — non persisté, aucun backend connecté.`}
        </p>
      )}
    </AdminLayout>
  );
}
