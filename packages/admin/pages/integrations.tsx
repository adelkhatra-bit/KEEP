import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';

type IntegrationStatus = 'UNKNOWN' | 'ACTIVE' | 'EXHAUSTED' | 'ERROR' | 'NOT_CONFIGURED';

type IntegrationRow = {
  key: string;
  category: string;
  label: string;
  secret?: boolean;
  configured: boolean;
  hint: string | null;
  updatedAt: string | null;
  runtimeStatus?: IntegrationStatus;
  lastCheckedAt?: string | null;
  lastError?: string | null;
};

type RuntimeStatusRow = {
  key: string;
  status: IntegrationStatus;
  last_checked_at: string | null;
  last_error: string | null;
};

type RecognitionProviderResult = {
  provider: 'KEYLESS_SOURCE' | 'AUDD' | 'ACRCLOUD';
  status: Exclude<IntegrationStatus, 'UNKNOWN'>;
  configured: boolean;
  message: string;
  checkedAt: string;
  providerCode?: number;
};

const CATEGORY_LABELS: Record<string, string> = {
  email: 'E-mail',
  music: 'Musique',
  recognition: 'Reconnaissance',
  payments: 'Paiements',
};

const AUDD_DASHBOARD = 'https://dashboard.audd.io/';
const AUDD_DOCS = 'https://docs.audd.io/';

const STATUS_LABELS: Record<IntegrationStatus, string> = {
  UNKNOWN: 'À tester',
  ACTIVE: 'Actif',
  EXHAUSTED: 'Quota épuisé',
  ERROR: 'Erreur fournisseur',
  NOT_CONFIGURED: 'Clé manquante',
};

const STATUS_COLORS: Record<IntegrationStatus, string> = {
  UNKNOWN: '#f0b429',
  ACTIVE: '#62c46f',
  EXHAUSTED: '#ff9f43',
  ERROR: '#e05252',
  NOT_CONFIGURED: 'var(--text-muted)',
};

async function invokeAdmin(body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase Super Admin non configuré.');
  const { data, error } = await supabase.functions.invoke('keep-admin-control', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.message || data.error);
  return data;
}

async function invokeRecognitionTest() {
  if (!supabase) throw new Error('Supabase Super Admin non configuré.');
  const { data, error } = await supabase.functions.invoke('keep-recognition-admin-test', { body: { action: 'test' } });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || 'Test des moteurs impossible.');
  return data as { ok: true; testedAt: string; recognitionReady: boolean; providers: RecognitionProviderResult[] };
}

export default function Integrations() {
  const [rows, setRows] = useState<IntegrationRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [keylessRuntime, setKeylessRuntime] = useState<RuntimeStatusRow | null>(null);
  const [lastRecognitionTest, setLastRecognitionTest] = useState<RecognitionProviderResult[]>([]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invokeAdmin({ action: 'integrations.list' });
      const baseRows = (result?.data ?? []) as IntegrationRow[];

      let statusRows: RuntimeStatusRow[] = [];
      if (supabase) {
        const { data: runtime, error: runtimeError } = await supabase.rpc('admin_integration_runtime_status');
        if (!runtimeError) statusRows = (runtime ?? []) as RuntimeStatusRow[];
      }
      const runtimeByKey = new Map(statusRows.map((item) => [item.key, item]));
      setKeylessRuntime(runtimeByKey.get('KEYLESS_SOURCE') ?? null);
      setRows(baseRows.map((row) => {
        const runtimeKey = row.key.startsWith('ACRCLOUD_') ? 'ACRCLOUD' : row.key;
        const runtime = runtimeByKey.get(runtimeKey);
        return {
          ...row,
          runtimeStatus: runtime?.status ?? (row.configured ? 'UNKNOWN' : 'NOT_CONFIGURED'),
          lastCheckedAt: runtime?.last_checked_at ?? null,
          lastError: runtime?.last_error ?? null,
        };
      }));
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

  const paidRows = useMemo(() => rows.filter((row) => row.key === 'AUDD_API_KEY'), [rows]);

  const save = async (row: IntegrationRow) => {
    const value = (values[row.key] ?? '').trim();
    if (!value) return setError(`Renseigne une valeur pour ${row.label}.`);
    if (/\s/.test(value)) return setError(`${row.label} : cette valeur contient un espace -- vérifie que tu n'as pas copié un caractère en trop.`);
    if (/^(your_|xxx|changeme|todo|test123|placeholder)/i.test(value)) return setError(`${row.label} : cette valeur ressemble à un exemple/placeholder, pas à une vraie clé. Colle la vraie valeur du fournisseur.`);
    setBusy(row.key); setError(null); setMessage(null);
    try {
      const result = await invokeAdmin({ action: 'integrations.set', key: row.key, value });
      setValues((prev) => ({ ...prev, [row.key]: '' }));
      if (row.key === 'AUDD_API_KEY' && result?.validation?.valid) {
        setMessage(`Clé AudD vérifiée par le fournisseur puis enregistrée dans Supabase Vault. État : ${result.validation.status}.`);
      } else if (row.key.startsWith('ACRCLOUD_') && result?.validation?.valid) {
        setMessage(`ACRCloud vérifié par le fournisseur : Host + Access Key + Access Secret sont compatibles. État : ${result.validation.status}. Le fallback est actif immédiatement.`);
      } else if (row.key.startsWith('ACRCLOUD_')) {
        setMessage(`${row.label} enregistré. ACRCloud sera automatiquement testé dès que Host + Access Key + Access Secret seront tous renseignés.`);
      } else {
        setMessage(`${row.label} enregistré dans Supabase Vault. La valeur précédente est remplacée sans être affichée.`);
      }
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

  const testRecognition = async () => {
    setBusy('RECOGNITION_TEST'); setError(null); setMessage(null);
    try {
      const result = await invokeRecognitionTest();
      setLastRecognitionTest(result.providers ?? []);
      const summary = (result.providers ?? []).map((item) => `${item.provider}: ${STATUS_LABELS[item.status]}`).join(' · ');
      setMessage(`Test réel terminé — ${summary}. Aucune clé secrète n’a été exposée.`);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Test des moteurs de reconnaissance impossible.');
    } finally {
      setBusy(null);
    }
  };

  const sendTest = async () => {
    setBusy('EMAIL_TEST'); setError(null); setMessage(null);
    try {
      await invokeAdmin({ action: 'integrations.test_email', email: testEmail.trim() });
      setMessage(`E-mail Loki envoyé à ${testEmail.trim()} via Brevo.`);
    } catch (e: any) {
      setError(e?.message ?? 'Test Brevo impossible.');
    } finally {
      setBusy(null);
    }
  };

  const keylessStatus = keylessRuntime?.status ?? 'UNKNOWN';

  return (
    <AdminLayout>
      <div className="page-title">Intégrations</div>
      <div className="page-subtitle">Clés et connexions externes de Loki — stockées chiffrées dans Supabase Vault.</div>

      {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
      {message && <div className="demo-banner" style={{ borderColor: '#2e7d32' }}>{message}</div>}
      {!error && !loading && <div className="demo-banner">● MODE RÉEL — aucune clé secrète n’est renvoyée au navigateur. Seul un indice masqué est affiché.</div>}

      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ marginTop: 0 }}>Reconnaissance musicale — santé réelle</h3>
        <p style={{ color: 'var(--text-muted)', marginTop: 0, lineHeight: 1.55 }}>
          Loki fonctionne d’abord avec les capacités natives et le fallback public sans clé. AudD et ACRCloud augmentent ensuite la couverture dès que des credentials valides sont ajoutés. Le bouton ci-dessous reteste les fournisseurs déjà enregistrés sans afficher leurs secrets.
        </p>
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <strong>Fallback gratuit — Apple + Deezer publics</strong>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
                Utilisé pour les liens partagés TikTok / YouTube / Instagram / Snapchat et les métadonnées publiques quand aucun moteur audio payant n’est disponible.
              </div>
            </div>
            <div style={{ color: STATUS_COLORS[keylessStatus], fontWeight: 800 }}>● {STATUS_LABELS[keylessStatus]}</div>
          </div>
          {keylessRuntime?.last_checked_at && <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 8 }}>Dernier contrôle réel : {new Date(keylessRuntime.last_checked_at).toLocaleString('fr-FR')}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <button onClick={() => void testRecognition()} disabled={busy === 'RECOGNITION_TEST'} style={{ fontWeight: 800 }}>
            {busy === 'RECOGNITION_TEST' ? 'Test en cours…' : 'Tester tous les moteurs maintenant'}
          </button>
          <button onClick={() => void load()} disabled={loading}>Actualiser les statuts</button>
        </div>
        {lastRecognitionTest.length > 0 && (
          <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
            {lastRecognitionTest.map((item) => (
              <div key={item.provider} style={{ fontSize: 12, color: STATUS_COLORS[item.status] }}>
                <strong>{item.provider}</strong> — {STATUS_LABELS[item.status]} · {item.message}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ marginTop: 0 }}>Services à quota / payants</h3>
        <p style={{ color: 'var(--text-muted)', marginTop: 0, lineHeight: 1.55 }}>
          Loki surveille l’état remonté par le fournisseur pendant les vraies utilisations. Si une clé est épuisée, le statut passe automatiquement en <strong>Quota épuisé</strong>. La clé peut ensuite être remplacée ici sans redéployer l’application.
        </p>
        {paidRows.map((row) => {
          const status = row.runtimeStatus ?? (row.configured ? 'UNKNOWN' : 'NOT_CONFIGURED');
          return <div key={row.key} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <strong>AudD — reconnaissance musicale</strong>
                <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
                  Sans clé, Loki exploite déjà le partage TikTok / YouTube / Instagram / Snapchat et les métadonnées publiques. Une clé AudD valide active automatiquement l’empreinte audio complète. Toute clé AudD invalide est refusée avant sauvegarde.
                </div>
              </div>
              <div style={{ color: STATUS_COLORS[status], fontWeight: 800 }}>● {STATUS_LABELS[status]}</div>
            </div>
            {row.lastCheckedAt && <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 8 }}>Dernier contrôle réel : {new Date(row.lastCheckedAt).toLocaleString('fr-FR')}</div>}
            {row.lastError && <div style={{ color: status === 'EXHAUSTED' ? '#ff9f43' : '#e05252', fontSize: 12, marginTop: 8 }}>Dernier retour : {row.lastError}</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <a href={AUDD_DASHBOARD} target="_blank" rel="noreferrer" style={{ display: 'inline-block', padding: '9px 13px', borderRadius: 8, background: 'var(--primary)', color: '#fff', textDecoration: 'none', fontWeight: 800 }}>
                Gérer / recharger AudD
              </a>
              <a href={AUDD_DOCS} target="_blank" rel="noreferrer" style={{ display: 'inline-block', padding: '9px 13px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text)', textDecoration: 'none' }}>
                Documentation AudD
              </a>
              <button onClick={() => void testRecognition()} disabled={busy === 'RECOGNITION_TEST'}>Tester AudD / ACRCloud</button>
            </div>
          </div>;
        })}
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ marginTop: 0 }}>E-mails Loki</h3>
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>
          Les comptes utilisateurs Loki utilisent maintenant <strong>identifiant Loki + mot de passe</strong> : aucun e-mail n’est obligatoire pour créer ou utiliser un compte. Les e-mails restent optionnels pour les invitations, messages système et récupération future. Le Super Admin conserve sa connexion séparée et renforcée. Le partage d’un profil ouvre la messagerie de l’utilisateur et ne consomme aucun envoi Loki.
        </p>
        <a
          href="https://supabase.com/dashboard/project/rrhqsqzcplvmwxizqnla/auth/templates"
          target="_blank"
          rel="noreferrer"
          style={{ display: 'inline-block', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text)', textDecoration: 'none' }}
        >
          Modèles e-mail d’administration
        </a>
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ marginTop: 0 }}>Tester l’envoi Brevo</h3>
        <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>Nécessite au minimum BREVO_API_KEY et BREVO_SENDER_EMAIL configurés ci-dessous. Ce test est indépendant de la connexion utilisateur Loki.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            type="email"
            placeholder="adresse@test.fr"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            style={{ flex: '1 1 280px', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 14px' }}
          />
          <button onClick={() => void sendTest()} disabled={busy === 'EMAIL_TEST' || !testEmail.trim()}>
            {busy === 'EMAIL_TEST' ? 'Envoi…' : 'Envoyer un test Loki'}
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
                {row.category === 'recognition' && (
                  <div style={{ color: STATUS_COLORS[row.runtimeStatus ?? 'UNKNOWN'], fontSize: 12, marginBottom: 8 }}>
                    ● {STATUS_LABELS[row.runtimeStatus ?? 'UNKNOWN']}
                    {row.lastCheckedAt ? ` · contrôle ${new Date(row.lastCheckedAt).toLocaleString('fr-FR')}` : ''}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', flex: '1 1 360px' }}>
                    <input
                      type={row.secret && !revealed[row.key] ? 'password' : 'text'}
                      placeholder={row.configured ? 'Nouvelle valeur pour remplacer…' : 'Renseigner la valeur…'}
                      value={values[row.key] ?? ''}
                      onChange={(e) => setValues((prev) => ({ ...prev, [row.key]: e.target.value }))}
                      style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 40px 10px 14px' }}
                    />
                    {row.secret && (
                      <button
                        type="button"
                        onClick={() => setRevealed((prev) => ({ ...prev, [row.key]: !prev[row.key] }))}
                        aria-label={revealed[row.key] ? 'Masquer la valeur' : 'Afficher la valeur'}
                        title={revealed[row.key] ? 'Masquer' : 'Afficher'}
                        style={{ position: 'absolute', right: 4, top: 4, bottom: 4, width: 32, background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}
                      >
                        {revealed[row.key] ? '🙈' : '👁'}
                      </button>
                    )}
                  </div>
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
