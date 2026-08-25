import React, { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { adminApi, AdminApiError, isBackendConfigured } from '../lib/apiClient';

interface RemoteConfigRow {
  key: string;
  value: unknown;
  description: string | null;
}

/**
 * Édition réelle de remote_config (demande explicite du 26/08/2026 -- "je
 * veux pouvoir la changer dans le super admin", à propos du texte de l'écran
 * Écouter au repos). Réutilise EXACTEMENT les routes déjà réelles
 * (GET/PUT /api/admin/remote-config, packages/backend/src/routes/admin.ts)
 * -- jamais une deuxième logique de config. Chaque ligne peut être un texte
 * (session_empty_title/subtitle) ou un nombre (quotas) -- l'éditeur choisit
 * le bon type de champ selon la valeur actuelle.
 */
export default function RemoteConfig() {
  const [rows, setRows] = useState<RemoteConfigRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<Record<string, string>>({});

  const load = async () => {
    if (!isBackendConfigured) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.get<{ data: RemoteConfigRow[] }>('/remote-config');
      setRows(res.data ?? []);
    } catch (e) {
      setError(e instanceof AdminApiError ? `${e.message} (HTTP ${e.status})` : 'Échec du chargement.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const draftFor = (row: RemoteConfigRow) => drafts[row.key] ?? (typeof row.value === 'string' ? row.value : JSON.stringify(row.value));

  const save = async (row: RemoteConfigRow) => {
    setSavingKey(row.key);
    setError(null);
    try {
      const raw = draftFor(row);
      const value = typeof row.value === 'number' ? Number(raw) : raw;
      await adminApi.put(`/remote-config/${encodeURIComponent(row.key)}`, { value, description: row.description });
      setSavedNote((n) => ({ ...n, [row.key]: `Enregistré à ${new Date().toLocaleTimeString('fr-FR')}` }));
      await load();
    } catch (e) {
      setError(e instanceof AdminApiError ? `${e.message} (HTTP ${e.status})` : "Échec de l'enregistrement.");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <AdminLayout>
      <div className="page-title">Textes & Quotas app</div>
      <div className="page-subtitle">Modifie directement ce que voient les utilisateurs KEEP -- effet immédiat, sans nouveau déploiement.</div>

      {!isBackendConfigured && (
        <div className="demo-banner">
          Backend non configuré (NEXT_PUBLIC_API_URL manquant) -- rien n'est éditable ici tant que ce n'est pas branché.
        </div>
      )}

      {error && <p style={{ color: 'var(--danger, #e05252)', fontSize: 13 }}>{error}</p>}
      {loading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Chargement…</p>}

      {!loading && rows.length > 0 && (
        <table>
          <thead>
            <tr><th>Clé</th><th>Valeur</th><th>Description</th><th /></tr>
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
                    onClick={() => save(row)}
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
