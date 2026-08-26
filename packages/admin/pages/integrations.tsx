import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';

type IntegrationRow = {
  key: string;
  category: string;
  label: string;
  secret?: boolean;
  configured: boolean;
  hint: string | null;
  updatedAt: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  email: 'E-mail',
  music: 'Musique',
  recognition: 'Reconnaissance',
  payments: 'Paiements',
};

async function invokeAdmin(body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase Super Admin non configuré.');
  const { data, error } = await supabase.functions.invoke('keep-admin-control', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.message || data.error);
  return data;
}

export default function Integrations() {
  const [rows, setRows] = useState<IntegrationRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invokeAdmin({ action: 'integrations.list' });
      setRows((result?.data ?? []) as IntegrationRow[]);
    } catch (e: any) {
      setError(e?.message ?? 'Impossible de charger les intégrations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const grouped = useMemo(() => {
    const map: Record<string, IntegrationRow[]> = {};
    for (const row of rows) (map[row.category] ||= []).push(row);
    return map;
  }, [rows]);

  const save = async (row: IntegrationRow) => {
    const value = (values[row.key] ?? '').trim();
    if (!value) return setError(`Renseigne une valeur pour ${row.label}.`);
    setBusy(row.key); setError(null); setMessage(null);
    try {
      await invokeAdmin({ action: 'integrations.set', key: row.key, value });
      setValues((prev) => ({ ...prev, [row.key]: '' }));
      setMessage(`${row.label} enregistré dans Supabase Vault.`);
      await load();
    } catch (e: any) {
      setError(e?.message ?? `Impossible d’enregistrer ${row.label}.`);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (row: IntegrationRow) => {
    setBusy(row.key); setError(null); setMessage(null);
    try {
      await invokeAdmin({ action: 'integrations.delete', key: row.key });
      setMessage(`${row.label} supprimé.`);
      await load();
    } catch (e: any) {
      setError(e?.message ?? `Impossible de supprimer ${row.label}.`);
    } finally {
      setBusy(null);
    }
  };

  const sendTest = async () => {
    setBusy('EMAIL_TEST'); setError(null); setMessage(null);
    try {
      await invokeAdmin({ action: 'integrations.test_email', email: testEmail.trim() });
      setMessage(`E-mail KEEP envoyé à ${testEmail.trim()} via Brevo.`);
    } catch (e: any) {
      setError(e?.message ?? 'Test Brevo impossible.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminLayout>
      <div className="page-title">Intégrations</div>
      <div className="page-subtitle">Clés et connexions externes de KEEP — stockées chiffrées dans Supabase Vault.</div>

      {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
      {message && <div className="demo-banner" style={{ borderColor: '#2e7d32' }}>{message}</div>}
      {!error && !loading && <div className="demo-banner">● MODE RÉEL — aucune clé secrète n’est renvoyée au navigateur. Seul un indice masqué est affiché.</div>}

      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ marginTop: 0 }}>E-mail d’authentification KEEP</h3>
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>
          L’application KEEP attend déjà un code à 6 chiffres. Pour que Supabase envoie le code plutôt qu’un « sign-in link »,
          le modèle <strong>Magic Link</strong> doit utiliser <code>{'{{ .Token }}'}</code>. Le modèle KEEP est versionné dans
          <code> supabase/templates/keep_magic_link_otp.html</code>.
        </p>
        <a
          href="https://supabase.com/dashboard/project/rrhqsqzcplvmwxizqnla/auth/templates"
          target="_blank"
          rel="noreferrer"
          style={{ display: 'inline-block', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text)', textDecoration: 'none' }}
        >
          Ouvrir les modèles e-mail Supabase
        </a>
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ marginTop: 0 }}>Tester l’envoi Brevo</h3>
        <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>Nécessite au minimum BREVO_API_KEY et BREVO_SENDER_EMAIL configurés ci-dessous.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            type="email"
            placeholder="adresse@test.fr"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            style={{ flex: '1 1 280px', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 14px' }}
          />
          <button onClick={() => void sendTest()} disabled={busy === 'EMAIL_TEST' || !testEmail.trim()}>
            {busy === 'EMAIL_TEST' ? 'Envoi…' : 'Envoyer un test KEEP'}
          </button>
        </div>
      </div>

      {loading && <div className="card">Chargement des intégrations…</div>}

      {!loading && Object.entries(grouped).map(([category, items]) => (
        <div className="card" key={category} style={{ marginBottom: 22 }}>
          <h3 style={{ marginTop: 0 }}>{CATEGORY_LABELS[category] ?? category}</h3>
          <div style={{ display: 'grid', gap: 14 }}>
            {items.map((row) => (
              <div key={row.key} style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <strong>{row.label}</strong>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 3 }}>{row.key}</div>
                  </div>
                  <div style={{ fontSize: 12, color: row.configured ? '#62c46f' : 'var(--text-muted)' }}>
                    {row.configured ? `● Configuré ${row.hint ? `(${row.hint})` : ''}` : '○ Non configuré'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    type={row.secret ? 'password' : 'text'}
                    placeholder={row.configured ? 'Nouvelle valeur pour remplacer…' : 'Renseigner la valeur…'}
                    value={values[row.key] ?? ''}
                    onChange={(e) => setValues((prev) => ({ ...prev, [row.key]: e.target.value }))}
                    style={{ flex: '1 1 360px', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 14px' }}
                  />
                  <button onClick={() => void save(row)} disabled={busy === row.key || !(values[row.key] ?? '').trim()}>
                    {busy === row.key ? 'Patiente…' : row.configured ? 'Remplacer' : 'Enregistrer'}
                  </button>
                  {row.configured && (
                    <button onClick={() => void remove(row)} disabled={busy === row.key} style={{ opacity: 0.8 }}>
                      Supprimer
                    </button>
                  )}
                </div>
                {row.updatedAt && <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>Mis à jour : {new Date(row.updatedAt).toLocaleString('fr-FR')}</div>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </AdminLayout>
  );
}
