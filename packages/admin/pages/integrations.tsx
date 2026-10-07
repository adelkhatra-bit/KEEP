import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';
import { INTEGRATION_PROVIDER_LINKS } from '../lib/integrationLinks';
import { invokeAdminFunction } from '../lib/invokeFunction';
import { openProviderPopup } from '../lib/providerWindow';

type IntegrationStatus = 'UNKNOWN' | 'ACTIVE' | 'EXHAUSTED' | 'ERROR' | 'NOT_CONFIGURED';

// Adel (20/09/2026) : "automatise tout ce que tu peux ... ne me demande pas
// de manipuler des API ou du code" -- pour une clé interne KEEP (pas un
// identifiant d'un fournisseur tiers), génère une valeur aléatoire
// directement dans le navigateur d'Adel au clic : ni Claude ni aucun
// serveur ne la voit avant qu'il clique "Enregistrer".
const GENERATABLE_KEYS = new Set(['AI_RELAY_API_KEY', 'ACCOUNT_EMAIL_CODE_SECRET']); // redeploy-force 2026-09-20
const MULTILINE_KEYS = new Set([
  'APPLE_MUSICKIT_PRIVATE_KEY',
  'APPLE_IAP_PRIVATE_KEY',
  'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON',
]);
const WHITESPACE_ALLOWED_KEYS = new Set([
  'APPLE_MUSICKIT_PRIVATE_KEY',
  'APPLE_IAP_PRIVATE_KEY',
  'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON',
  'BREVO_SENDER_NAME',
]);
function generateRandomKey(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

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
  configurationIssue?: string | null;
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
  automation: 'Automatisation & relais',
};

const STATUS_LABELS: Record<IntegrationStatus, string> = {
  UNKNOWN: 'À tester',
  ACTIVE: 'Actif',
  EXHAUSTED: 'Quota épuisé',
  ERROR: 'Refusée / erreur',
  NOT_CONFIGURED: 'Clé manquante',
};

const STATUS_COLORS: Record<IntegrationStatus, string> = {
  UNKNOWN: '#f0b429',
  ACTIVE: '#62c46f',
  EXHAUSTED: '#ff9f43',
  ERROR: '#e05252',
  NOT_CONFIGURED: 'var(--text-muted)',
};

const invokeAdmin = (body: Record<string, unknown>) => invokeAdminFunction('keep-admin-control', body);

async function invokeRecognitionTest() {
  const data = await invokeAdminFunction<{ ok: boolean; testedAt: string; recognitionReady: boolean; providers: RecognitionProviderResult[]; error?: string }>('keep-recognition-admin-test', { action: 'test' });
  if (!data?.ok) throw new Error(data?.error || 'Test des moteurs impossible.');
  return data;
}

export default function Integrations() {
  const [rows, setRows] = useState<IntegrationRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [keylessRuntime, setKeylessRuntime] = useState<RuntimeStatusRow | null>(null);
  const [lastRecognitionTest, setLastRecognitionTest] = useState<RecognitionProviderResult[]>([]);
  const [rowFeedback, setRowFeedback] = useState<Record<string, { kind: 'ok' | 'error'; text: string }>>({});

  const load = async (keepPageStable = false) => {
    if (!keepPageStable) setLoading(true);
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
      if (!keepPageStable) setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const acrCloudActive = rows.some((row) => row.key.startsWith('ACRCLOUD_') && row.runtimeStatus === 'ACTIVE');

  const needsAttention = (row: IntegrationRow) => {
    const status = row.runtimeStatus ?? (row.configured ? 'UNKNOWN' : 'NOT_CONFIGURED');
    // ACRCloud est le moteur serveur actif. AudD peut rester absent sans
    // rendre la reconnaissance indisponible : ne jamais le présenter comme
    // une panne bloquante ni le dupliquer dans la zone d'alerte.
    if (row.key === 'AUDD_API_KEY' && !row.configured && acrCloudActive) return false;
    return !row.configured
      || Boolean(row.configurationIssue)
      || status === 'ERROR'
      || status === 'EXHAUSTED'
      || (row.category === 'recognition' && status === 'UNKNOWN');
  };

  const attentionRows = useMemo(
    () => rows.filter(needsAttention).sort((a, b) => {
      const weight = (row: IntegrationRow) => {
        const status = row.runtimeStatus ?? (row.configured ? 'UNKNOWN' : 'NOT_CONFIGURED');
        if (row.configurationIssue || status === 'ERROR') return 0;
        if (status === 'EXHAUSTED') return 1;
        if (!row.configured || status === 'NOT_CONFIGURED') return 2;
        return 3;
      };
      return weight(a) - weight(b) || a.label.localeCompare(b.label, 'fr');
    }),
    [rows],
  );

  const grouped = useMemo(() => {
    const map: Record<string, IntegrationRow[]> = {};
    for (const row of rows.filter((item) => !needsAttention(item))) (map[row.category] ||= []).push(row);
    return map;
  }, [rows]);

  const keepRowVisible = (key: string) => {
    if (typeof document === 'undefined') return;
    window.setTimeout(() => {
      document.getElementById(`integration-${key}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 80);
  };

  const openProviderWindow = (row: IntegrationRow) => {
    const provider = INTEGRATION_PROVIDER_LINKS[row.key];
    if (!provider?.url) return;
    const opened = openProviderPopup(provider.url, `loki-provider-${row.key}`);
    if (!opened) {
      setRowFeedback((prev) => ({
        ...prev,
        [row.key]: { kind: 'error', text: 'La petite fenêtre a été bloquée par le navigateur. Autorise les pop-ups pour Loki Super Admin puis réessaie.' },
      }));
    }
  };

  const save = async (row: IntegrationRow) => {
    const value = (values[row.key] ?? '').trim();
    const fail = (text: string) => {
      setRowFeedback((prev) => ({ ...prev, [row.key]: { kind: 'error', text } }));
      keepRowVisible(row.key);
    };
    if (!value) return fail(`Renseigne une valeur pour ${row.label}.`);
    if (!WHITESPACE_ALLOWED_KEYS.has(row.key) && /\s/.test(value)) return fail(`${row.label} : cette valeur contient un espace. Vérifie le copier-coller.`);
    if (/^(your_|xxx|changeme|todo|test123|placeholder)/i.test(value)) return fail(`${row.label} : cette valeur ressemble à un exemple, pas à une vraie clé fournisseur.`);
    setBusy(row.key); setError(null); setMessage(null);
    setRowFeedback((prev) => { const next = { ...prev }; delete next[row.key]; return next; });
    try {
      const result = await invokeAdmin({ action: 'integrations.set', key: row.key, value });
      setValues((prev) => ({ ...prev, [row.key]: '' }));
      const text =
        row.key === 'AUDD_API_KEY' && result?.validation?.valid
          ? `Clé AudD vérifiée par le fournisseur. État : ${result.validation.status}.`
          : row.key.startsWith('ACRCLOUD_') && result?.validation?.valid
            ? `ACRCloud vérifié : Host + Access Key + Access Secret sont compatibles. État : ${result.validation.status}.`
            : row.key.startsWith('ACRCLOUD_')
              ? `${row.label} enregistré. Le test complet se lance dès que les 3 valeurs ACRCloud sont présentes.`
              : result?.validation?.valid
                ? `${result.validation.message || 'Valeur vérifiée avant sauvegarde.'} État : ${result.validation.status}.`
                : `${row.label} enregistré dans Supabase Vault.`;
      setRowFeedback((prev) => ({ ...prev, [row.key]: { kind: 'ok', text } }));
      await load(true);
      keepRowVisible(row.key);
    } catch (e: any) {
      fail(`REFUSÉE — ${e?.message ?? `Impossible d’enregistrer ${row.label}.`}`);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (row: IntegrationRow) => {
    setBusy(row.key); setError(null); setMessage(null);
    try {
      await invokeAdmin({ action: 'integrations.delete', key: row.key });
      setRowFeedback((prev) => ({ ...prev, [row.key]: { kind: 'ok', text: `${row.label} supprimé. Cette intégration remonte maintenant dans « À corriger maintenant ».` } }));
      await load(true);
      keepRowVisible(row.key);
    } catch (e: any) {
      setRowFeedback((prev) => ({ ...prev, [row.key]: { kind: 'error', text: e?.message ?? `Impossible de supprimer ${row.label}.` } }));
      keepRowVisible(row.key);
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
      await load(true);
    } catch (e: any) {
      setError(e?.message ?? 'Test des moteurs de reconnaissance impossible.');
    } finally {
      setBusy(null);
    }
  };

  const keylessStatus = keylessRuntime?.status ?? 'UNKNOWN';

  const renderIntegrationRow = (row: IntegrationRow, urgent = false) => {
    const status = row.runtimeStatus ?? (row.configured ? 'UNKNOWN' : 'NOT_CONFIGURED');
    const feedback = rowFeedback[row.key];
    const provider = INTEGRATION_PROVIDER_LINKS[row.key];
    const optionalAudd =
      row.key === 'AUDD_API_KEY'
      && !row.configured
      && acrCloudActive
      && (status === 'NOT_CONFIGURED' || status === 'UNKNOWN');
    const displayedStatus = optionalAudd ? 'Optionnel · ACRCloud actif' : STATUS_LABELS[status];
    const displayedStatusColor = optionalAudd ? '#c9c3d2' : STATUS_COLORS[status];
    return (
      <div
        key={row.key}
        id={`integration-${row.key}`}
        style={{
          border: urgent ? '1px solid #f0b429' : '1px solid var(--border)',
          borderRadius: 12,
          padding: 14,
          background: urgent ? 'rgba(240,180,41,.055)' : 'transparent',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <strong style={{ color: '#fff' }}>{row.label}</strong>
            <div style={{ color: '#d9d5e2', fontSize: 12, marginTop: 3 }}>{row.key}</div>
          </div>
          <div style={{ fontSize: 12, color: displayedStatusColor, fontWeight: 800 }}>
            ● {displayedStatus}
          </div>
        </div>

        {row.configurationIssue && (
          <div style={{ marginBottom: 9, padding: '9px 11px', borderRadius: 9, border: '1px solid #e05252', color: '#ffd6dc', background: 'rgba(224,82,82,.09)', fontSize: 12, lineHeight: 1.45 }}>
            <strong>Configuration incorrecte :</strong> {row.configurationIssue}
          </div>
        )}
        {optionalAudd ? (
          <div style={{ color: '#e7e2ec', fontSize: 12, marginBottom: 8, lineHeight: 1.45 }}>
            La reconnaissance fonctionne déjà avec ACRCloud. Ajoute AudD ici uniquement si tu veux aussi utiliser ton abonnement AudD.
          </div>
        ) : row.lastError && (status === 'ERROR' || status === 'EXHAUSTED' || status === 'NOT_CONFIGURED') ? (
          <div
            role="status"
            style={{
              color: status === 'EXHAUSTED' ? '#fff0c2' : status === 'ERROR' ? '#ffe2e7' : '#f4eef9',
              fontSize: 12,
              marginBottom: 8,
              lineHeight: 1.45,
              fontWeight: 700,
            }}
          >
            {status === 'ERROR' ? 'Dernier essai refusé : ' : status === 'EXHAUSTED' ? 'Fournisseur reconnu : ' : 'État : '}
            {row.lastError}
          </div>
        ) : null}

        {provider ? (
          <div style={{ marginBottom: 10, padding: '11px 12px', borderRadius: 10, background: 'rgba(124,92,252,.08)', border: '1px solid rgba(124,92,252,.32)' }}>
            <div style={{ color: '#ffffff', fontSize: 12, lineHeight: 1.5 }}>
              <strong>Où trouver cette valeur :</strong> {provider.help}
            </div>
            {provider.expected ? (
              <div style={{ color: '#e9e3f2', fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>
                <strong>Valeur attendue :</strong> {provider.expected}
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 9 }}>
              {provider.url ? (
                <button
                  type="button"
                  onClick={() => openProviderWindow(row)}
                  style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(139,92,246,.16)', border: '1px solid var(--primary)', color: '#ffffff', fontWeight: 900, cursor: 'pointer' }}
                >
                  ↗ OUVRIR {provider.label.toUpperCase()}
                </button>
              ) : null}
              {provider.fixedValue ? (
                <button
                  type="button"
                  onClick={() => setValues((prev) => ({ ...prev, [row.key]: provider.fixedValue as string }))}
                  style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(45,225,194,.12)', border: '1px solid #2de1c2', color: '#d9fff8', fontWeight: 900, cursor: 'pointer' }}
                >
                  UTILISER « {provider.fixedValue} »
                </button>
              ) : null}
            </div>
            <div style={{ color: '#cfc8db', fontSize: 11, lineHeight: 1.45, marginTop: 7 }}>
              Le fournisseur s’ouvre dans une petite fenêtre. Le Super Admin reste ouvert derrière et conserve exactement ta position.
            </div>
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 360px' }}>
            {MULTILINE_KEYS.has(row.key) ? (
              <textarea
                rows={6}
                placeholder={row.configured ? 'Nouvelle valeur complète pour remplacer…' : 'Colle la valeur complète ici…'}
                value={values[row.key] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [row.key]: e.target.value }))}
                spellCheck={false}
                style={{ width: '100%', minHeight: 132, resize: 'vertical', boxSizing: 'border-box', background: 'var(--bg-card)', border: '1px solid var(--border)', color: '#fff', borderRadius: 8, padding: '10px 40px 10px 14px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}
              />
            ) : (
              <input
                type={row.secret && !revealed[row.key] ? 'password' : 'text'}
                placeholder={row.configured ? 'Nouvelle valeur pour remplacer…' : 'Renseigner la valeur…'}
                value={values[row.key] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [row.key]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !busy && (values[row.key] ?? '').trim()) {
                    e.preventDefault();
                    void save(row);
                  }
                }}
                style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-card)', border: '1px solid var(--border)', color: '#fff', borderRadius: 8, padding: '10px 40px 10px 14px' }}
              />
            )}
            {row.secret && !MULTILINE_KEYS.has(row.key) && (
              <button
                type="button"
                onClick={() => setRevealed((prev) => ({ ...prev, [row.key]: !prev[row.key] }))}
                aria-label={revealed[row.key] ? 'Masquer la valeur' : 'Afficher la valeur'}
                title={revealed[row.key] ? 'Masquer' : 'Afficher'}
                style={{ position: 'absolute', right: 4, top: 4, bottom: 4, width: 32, background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16 }}
              >
                {revealed[row.key] ? '🙈' : '👁'}
              </button>
            )}
          </div>
          {GENERATABLE_KEYS.has(row.key) && (
            <button
              type="button"
              onClick={() => setValues((prev) => ({ ...prev, [row.key]: generateRandomKey() }))}
              title="Génère une valeur aléatoire dans ce navigateur"
              style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(139,92,246,.14)', border: '1px solid var(--primary)', color: '#cbb8ff', fontWeight: 800, cursor: 'pointer' }}
            >
              🎲 Générer
            </button>
          )}
          <button
            onClick={() => void save(row)}
            disabled={busy === row.key || !(values[row.key] ?? '').trim()}
            style={{ minWidth: 190, fontWeight: 900 }}
          >
            {busy === row.key ? 'TEST EN COURS…' : row.configured ? 'TESTER + REMPLACER' : 'TESTER + ENREGISTRER'}
          </button>
          {row.configured && (
            <button onClick={() => void remove(row)} disabled={busy === row.key} style={{ opacity: 0.9 }}>
              Supprimer
            </button>
          )}
        </div>

        {feedback && (
          <div
            role="status"
            style={{
              marginTop: 9,
              padding: '9px 11px',
              borderRadius: 9,
              border: `1px solid ${feedback.kind === 'ok' ? '#62c46f' : '#e05252'}`,
              color: feedback.kind === 'ok' ? '#c9f7d0' : '#ffd6dc',
              background: feedback.kind === 'ok' ? 'rgba(98,196,111,.09)' : 'rgba(224,82,82,.09)',
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1.45,
            }}
          >
            {feedback.kind === 'ok' ? '✓ ' : '✕ '}{feedback.text}
          </div>
        )}
        <div style={{ marginTop: 7, display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: '#e8e3ee' }}>
          {row.updatedAt ? <span>Enregistrée : {new Date(row.updatedAt).toLocaleString('fr-FR')}</span> : <span>Aucune valeur enregistrée</span>}
          {row.lastCheckedAt ? <span>Dernier contrôle : {new Date(row.lastCheckedAt).toLocaleString('fr-FR')}</span> : null}
        </div>
      </div>
    );
  };

  return (
    <AdminLayout>
      <div className="page-title">Intégrations</div>
      <div className="page-subtitle">Clés et connexions externes de Loki Music — stockées chiffrées dans Supabase Vault.</div>

      {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
      {message && <div className="demo-banner" style={{ borderColor: '#2e7d32' }}>{message}</div>}
      {!error && !loading && <div className="demo-banner">● MODE RÉEL — aucune clé secrète n’est renvoyée au navigateur. Seul un indice masqué est affiché.</div>}

      {!loading && (
        <div className="card" style={{ marginBottom: 22, border: attentionRows.length ? '1px solid #f0b429' : '1px solid #62c46f' }}>
          <h3 style={{ marginTop: 0, color: '#fff' }}>
            {attentionRows.length ? `À corriger maintenant · ${attentionRows.length}` : 'Intégrations · tout est OK'}
          </h3>
          <p style={{ color: '#e7e2ec', marginTop: 0, lineHeight: 1.55 }}>
            {attentionRows.length
              ? 'Loki remonte ici automatiquement les clés manquantes, refusées, mal configurées ou sans quota. Tu peux les corriger directement ici sans chercher plus bas.'
              : 'Aucune intégration ne demande une action immédiate.'}
          </p>
          {attentionRows.length > 0 && <div style={{ display: 'grid', gap: 12 }}>{attentionRows.map((row) => renderIntegrationRow(row, true))}</div>}
        </div>
      )}

      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ marginTop: 0 }}>Renouvellement intelligent des clés</h3>
        <p style={{ color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.6 }}>
          Les clés internes Loki Music peuvent être générées ici. Pour une clé Spotify, Apple, Google, Brevo, Stripe ou autre fournisseur, le bouton ouvre directement sa page officielle de création/révocation : ces plateformes interdisent qu’une ancienne clé crée silencieusement sa remplaçante. Après remplacement, Loki Music conserve la nouvelle valeur dans le Vault et les tests disponibles s’exécutent avant activation.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
          <span style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(98,196,111,.14)', color: '#62c46f' }}>Automatique : clés internes Loki Music</span>
          <span style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(240,180,41,.12)', color: '#f0b429' }}>Guidé : clés fournisseurs</span>
          <span style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(224,82,82,.12)', color: '#ff7a7a' }}>Révocation distante jamais simulée</span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ marginTop: 0 }}>Reconnaissance musicale — santé réelle</h3>
        <p style={{ color: 'var(--text-muted)', marginTop: 0, lineHeight: 1.55 }}>
          Loki Music fonctionne d’abord avec les capacités natives et sa mémoire musicale. Côté serveur, ACRCloud est le moteur actif dès qu’il est configuré. AudD est un moteur complémentaire optionnel : son absence ne doit jamais être affichée comme une panne si ACRCloud est actif.
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
          <button onClick={() => void load(true)} disabled={loading}>Actualiser les statuts</button>
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
        <h3 style={{ marginTop: 0 }}>E-mails Loki Music</h3>
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>
          Les comptes utilisateurs Loki Music utilisent <strong>identifiant Loki Music + mot de passe + e-mail vérifié</strong>. Les e-mails transactionnels essaient automatiquement <strong>Resend</strong>, puis <strong>Mailjet</strong>, puis <strong>Brevo</strong>. Si un fournisseur tombe, Loki utilise le suivant et conserve les messages non livrés dans sa file de retry.
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

      {/* Adel (08/09/2026) : "verifie bien que dans toutes ces rubriques
          tu n'as pas cree des doublons" -- ce card dupliquait exactement
          /email-test (meme action integrations.test_email). Un seul
          endroit pour tester l'envoi desormais, avec en plus les vrais
          gabarits signup/mot de passe oublie et le diagnostic de
          delivrabilite. */}
      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ marginTop: 0 }}>Tester l’envoi e-mail</h3>
        <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
          Priorité recommandée : RESEND_API_KEY + EMAIL_SENDER_ADDRESS. Mailjet et Brevo restent disponibles en secours automatique.
        </p>
        <a href="/email-test" style={{ display: 'inline-block', padding: '10px 14px', borderRadius: 8, background: 'var(--primary)', color: '#fff', textDecoration: 'none', fontWeight: 800 }}>
          Ouvrir « Test e-mail »
        </a>
      </div>

      {loading && <div className="card">Chargement des intégrations…</div>}

      {!loading && Object.entries(grouped).map(([category, items]) => (
        <div className="card" key={category} style={{ marginBottom: 22 }}>
          <h3 style={{ marginTop: 0, color: '#fff' }}>{CATEGORY_LABELS[category] ?? category}</h3>
          <div style={{ display: 'grid', gap: 14 }}>
            {items.map((row) => renderIntegrationRow(row))}
          </div>
        </div>
      ))}
    </AdminLayout>
  );
}
