import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';

type IntegrationRow = {
  key: string;
  category: string;
  label: string;
  configured: boolean;
  hint: string | null;
  updatedAt: string | null;
  source?: string | null;
};

type RuntimeRow = {
  key: string;
  status: string;
  last_checked_at: string | null;
  last_error: string | null;
};

type DirectoryUser = {
  id: string;
  email: string | null;
  username: string;
  display_name: string | null;
  support_number: number;
  country_code: string | null;
  kind: string | null;
  created_at: string;
  plan_code: string;
  keeps_this_month: number;
};

type PushSummaryRow = { status: string; total: number | string };
type PushRecentRow = {
  notification_id: string;
  username: string | null;
  title: string;
  created_at: string;
  delivery_status: string;
  attempt_count: number;
  last_error: string | null;
  delivered_at: string | null;
};

type KeylessHealth = {
  ok: boolean;
  provider?: string;
  apiKeyRequired?: boolean;
  platforms?: string[];
  catalogs?: string[];
  minimumConfidence?: number;
};

const BILLING_LINKS: Record<string, { label: string; url: string }> = {
  BREVO_API_KEY: { label: 'Brevo — crédits / offre', url: 'https://app.brevo.com/' },
  BREVO_SMTP_KEY: { label: 'Brevo — crédits / offre', url: 'https://app.brevo.com/' },
  AUDD_API_KEY: { label: 'AudD — recharger / abonnement', url: 'https://dashboard.audd.io/' },
  ACRCLOUD_ACCESS_KEY: { label: 'ACRCloud — console / facturation', url: 'https://console.acrcloud.com/' },
  ACRCLOUD_ACCESS_SECRET: { label: 'ACRCloud — console / facturation', url: 'https://console.acrcloud.com/' },
  SPOTIFY_CLIENT_ID: { label: 'Spotify Developer Dashboard', url: 'https://developer.spotify.com/dashboard' },
  SPOTIFY_CLIENT_SECRET: { label: 'Spotify Developer Dashboard', url: 'https://developer.spotify.com/dashboard' },
  DEEZER_APP_ID: { label: 'Deezer Developers', url: 'https://developers.deezer.com/' },
  DEEZER_APP_SECRET: { label: 'Deezer Developers', url: 'https://developers.deezer.com/' },
  APPLE_MUSICKIT_TEAM_ID: { label: 'Apple Developer', url: 'https://developer.apple.com/account/' },
  APPLE_MUSICKIT_KEY_ID: { label: 'Apple Developer', url: 'https://developer.apple.com/account/' },
  APPLE_MUSICKIT_PRIVATE_KEY: { label: 'Apple Developer', url: 'https://developer.apple.com/account/' },
  APPLE_IAP_ISSUER_ID: { label: 'App Store Connect', url: 'https://appstoreconnect.apple.com/' },
  APPLE_IAP_KEY_ID: { label: 'App Store Connect', url: 'https://appstoreconnect.apple.com/' },
  APPLE_IAP_PRIVATE_KEY: { label: 'App Store Connect', url: 'https://appstoreconnect.apple.com/' },
  GOOGLE_PLAY_PACKAGE_NAME: { label: 'Google Play Console', url: 'https://play.google.com/console/' },
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: { label: 'Google Play Console', url: 'https://play.google.com/console/' },
  STRIPE_SECRET_KEY: { label: 'Stripe Dashboard', url: 'https://dashboard.stripe.com/' },
  STRIPE_WEBHOOK_SECRET: { label: 'Stripe Dashboard', url: 'https://dashboard.stripe.com/' },
};

const PUSH_LABELS: Record<string, string> = {
  CREATED: 'Créées',
  NO_DEVICE: 'Aucun appareil',
  SENT: 'Envoyées',
  DELIVERED: 'Livrées',
  FAILED: 'Échouées',
  TOKENS_REGISTERED: 'Appareils enregistrés',
  ATTEMPTS_24H: 'Tentatives 24 h',
};

const PUSH_TONES: Record<string, string> = {
  CREATED: '#c4b5fd',
  NO_DEVICE: '#f59e0b',
  SENT: '#93c5fd',
  DELIVERED: '#86efac',
  FAILED: '#fb7185',
  TOKENS_REGISTERED: '#67e8f9',
  ATTEMPTS_24H: '#d8b4fe',
};

async function invokeAdmin(body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase Super Admin non configuré.');
  const { data, error } = await supabase.functions.invoke('keep-admin-control', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.message || data.error);
  return data;
}

function statusInfo(integration: IntegrationRow, runtime?: RuntimeRow) {
  if (!integration.configured) return { text: 'NON CONFIGURÉE', tone: '#8f849f' };
  const raw = `${runtime?.status ?? ''} ${runtime?.last_error ?? ''}`.toUpperCase();
  if (/EXHAUST|QUOTA|CREDIT|PAYMENT|INSUFFICIENT|LIMIT REACHED|402/.test(raw)) {
    return { text: 'ÉPUISÉE / À RECHARGER', tone: '#fb7185' };
  }
  if (/ERROR|FAILED|INVALID|REVOKED|UNAUTHORIZED|403|401/.test(raw)) {
    return { text: 'ERREUR / ACTION REQUISE', tone: '#f59e0b' };
  }
  if (/OK|HEALTHY|ACTIVE|READY/.test(raw)) return { text: 'OPÉRATIONNELLE', tone: '#86efac' };
  return { text: 'CONFIGURÉE · À CONTRÔLER', tone: '#a78bfa' };
}

export default function Operations() {
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [runtime, setRuntime] = useState<RuntimeRow[]>([]);
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [pushSummary, setPushSummary] = useState<PushSummaryRow[]>([]);
  const [pushRecent, setPushRecent] = useState<PushRecentRow[]>([]);
  const [keylessHealth, setKeylessHealth] = useState<KeylessHealth | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!supabase) throw new Error('Supabase Super Admin non configuré.');
      const [integrationResult, runtimeResult, usersResult, pushSummaryResult, pushRecentResult, keylessResult] = await Promise.all([
        invokeAdmin({ action: 'integrations.list' }),
        supabase.rpc('admin_integration_runtime_status'),
        supabase.rpc('admin_user_directory'),
        supabase.rpc('admin_push_delivery_summary'),
        supabase.rpc('admin_push_delivery_recent', { p_limit: 50 }),
        supabase.functions.invoke('keep-keyless-social', { body: { action: 'health' } }),
      ]);
      if (runtimeResult.error) throw runtimeResult.error;
      if (usersResult.error) throw usersResult.error;
      if (pushSummaryResult.error) throw pushSummaryResult.error;
      if (pushRecentResult.error) throw pushRecentResult.error;
      setIntegrations((integrationResult?.data ?? []) as IntegrationRow[]);
      setRuntime((runtimeResult.data ?? []) as RuntimeRow[]);
      setUsers((usersResult.data ?? []) as DirectoryUser[]);
      setPushSummary((pushSummaryResult.data ?? []) as PushSummaryRow[]);
      setPushRecent((pushRecentResult.data ?? []) as PushRecentRow[]);
      setKeylessHealth(!keylessResult.error && keylessResult.data?.ok ? keylessResult.data as KeylessHealth : null);
    } catch (e: any) {
      setError(e?.message ?? 'Impossible de charger les opérations KEEP.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const runtimeByKey = useMemo(() => new Map(runtime.map((r) => [r.key, r])), [runtime]);
  const pushByStatus = useMemo(() => new Map(pushSummary.map((r) => [r.status, Number(r.total) || 0])), [pushSummary]);
  const paidIntegrations = useMemo(
    () => integrations.filter((row) => Boolean(BILLING_LINKS[row.key])),
    [integrations],
  );
  const audd = useMemo(() => integrations.find((row) => row.key === 'AUDD_API_KEY'), [integrations]);
  const acrCloudComplete = useMemo(() => ['ACRCLOUD_ACCESS_KEY', 'ACRCLOUD_ACCESS_SECRET', 'ACRCLOUD_HOST']
    .every((key) => integrations.find((row) => row.key === key)?.configured), [integrations]);
  const acrRuntime = runtimeByKey.get('ACRCLOUD');
  const acrRaw = `${acrRuntime?.status ?? ''} ${acrRuntime?.last_error ?? ''}`.toUpperCase();
  const acrState = !acrCloudComplete
    ? { text: 'NON CONFIGURÉ', tone: '#8f849f' }
    : /ERROR|FAILED|INVALID|REVOKED|UNAUTHORIZED|403|401/.test(acrRaw)
      ? { text: 'ERREUR / ACTION REQUISE', tone: '#f59e0b' }
      : /OK|HEALTHY|ACTIVE|READY/.test(acrRaw)
        ? { text: 'OPÉRATIONNEL', tone: '#86efac' }
        : { text: 'CONFIGURÉ · À CONTRÔLER', tone: '#a78bfa' };
  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((u) => [
      u.username,
      u.display_name ?? '',
      u.email ?? '',
      u.plan_code,
      String(u.support_number ?? ''),
      `keep-${u.support_number ?? ''}`,
    ].some((v) => v.toLowerCase().includes(needle)));
  }, [query, users]);

  return (
    <AdminLayout>
      <div className="page-title">Santé KEEP & Support abonnés</div>
      <div className="page-subtitle">Reconnaissance musicale, services externes, livraison push réelle et support utilisateurs dans une vue unique.</div>

      {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
      <button onClick={() => void load()} disabled={loading} style={{ marginBottom: 18 }}>
        {loading ? 'Analyse…' : 'Actualiser l’analyse'}
      </button>

      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ marginTop: 0 }}>Reconnaissance musicale — ordre réel de secours</h3>
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.55 }}>
          KEEP ne dépend plus d’une seule API. Sur iPhone, ShazamKit est tenté avant les fournisseurs payants. Un partage TikTok / Instagram / Snapchat / YouTube / Facebook peut aussi être résolu sans clé via les métadonnées publiques et un recoupement de catalogues. AudD et ACRCloud restent des moteurs supplémentaires automatiquement utilisés lorsqu’ils sont configurés et validés.
        </p>
        <table>
          <thead><tr><th>Moteur</th><th>État</th><th>Clé requise</th><th>Contrôle</th></tr></thead>
          <tbody>
            <tr>
              <td><strong>Fallback social KEEP</strong><div style={{ color: 'var(--text-muted)', fontSize: 11 }}>TikTok · Instagram · Snapchat · YouTube · Facebook</div></td>
              <td><strong style={{ color: keylessHealth?.ok ? '#86efac' : '#f59e0b' }}>{keylessHealth?.ok ? 'OPÉRATIONNEL' : 'INJOIGNABLE / À CONTRÔLER'}</strong></td>
              <td>Non</td>
              <td style={{ maxWidth: 360, whiteSpace: 'normal' }}>{keylessHealth?.ok ? `Supabase actif · Apple Search + Deezer public · confiance mini ${Math.round((keylessHealth.minimumConfidence ?? 0.72) * 100)} %` : 'Le health Supabase ne répond pas encore.'}</td>
            </tr>
            <tr>
              <td><strong>ShazamKit iOS</strong><div style={{ color: 'var(--text-muted)', fontSize: 11 }}>empreinte audio native Apple</div></td>
              <td><strong style={{ color: '#93c5fd' }}>INTÉGRÉ · TEST APPAREIL REQUIS</strong></td>
              <td>Pas de clé AudD/ACRCloud</td>
              <td style={{ maxWidth: 360, whiteSpace: 'normal' }}>Module natif présent. L’App Service ShazamKit et le comportement réel seront certifiés avec le build iPhone/TestFlight.</td>
            </tr>
            <tr>
              <td><strong>AudD</strong><div style={{ color: 'var(--text-muted)', fontSize: 11 }}>fallback serveur</div></td>
              <td><strong style={{ color: audd ? statusInfo(audd, runtimeByKey.get('AUDD_API_KEY')).tone : '#8f849f' }}>{audd ? statusInfo(audd, runtimeByKey.get('AUDD_API_KEY')).text : 'NON CONFIGURÉE'}</strong></td>
              <td>Oui</td>
              <td style={{ maxWidth: 360, whiteSpace: 'normal' }}>{runtimeByKey.get('AUDD_API_KEY')?.last_error ?? 'La clé est testée côté fournisseur au moment de son enregistrement dans Clés & intégrations.'}</td>
            </tr>
            <tr>
              <td><strong>ACRCloud</strong><div style={{ color: 'var(--text-muted)', fontSize: 11 }}>second fallback serveur</div></td>
              <td><strong style={{ color: acrState.tone }}>{acrState.text}</strong></td>
              <td>Oui · 3 paramètres</td>
              <td style={{ maxWidth: 360, whiteSpace: 'normal' }}>{acrRuntime?.last_error ?? 'Host + Access Key + Access Secret sont validés ensemble dès que les trois sont renseignés.'}</td>
            </tr>
            <tr>
              <td><strong>Micro Android arrière-plan</strong><div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Foreground Service microphone</div></td>
              <td><strong style={{ color: '#93c5fd' }}>INTÉGRÉ · TEST APPAREIL REQUIS</strong></td>
              <td>Non</td>
              <td style={{ maxWidth: 360, whiteSpace: 'normal' }}>Service natif lié à la session KEEP ; il démarre après RECORD_AUDIO et s’arrête avec la session.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ marginTop: 0 }}>Services / clés pouvant générer un coût</h3>
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.55 }}>
          Une clé épuisée, un quota atteint ou un paiement requis remonte en rouge dès que le moteur enregistre l’erreur fournisseur. Le bouton ouvre directement le site officiel du fournisseur pour recharger ou gérer l’offre.
        </p>
        <table>
          <thead><tr><th>Service</th><th>État</th><th>Dernier contrôle</th><th>Détail</th><th>Recharge / compte</th></tr></thead>
          <tbody>
            {!loading && paidIntegrations.length === 0 && <tr><td colSpan={5}>Aucun service payant détecté.</td></tr>}
            {paidIntegrations.map((row) => {
              const live = row.key.startsWith('ACRCLOUD_') ? runtimeByKey.get('ACRCLOUD') : runtimeByKey.get(row.key);
              const state = statusInfo(row, live);
              const billing = BILLING_LINKS[row.key];
              return <tr key={row.key}>
                <td><strong>{row.label}</strong><div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{row.key}</div></td>
                <td><strong style={{ color: state.tone }}>{state.text}</strong><div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{row.configured ? (row.source ?? 'CONFIGURÉE') : 'Aucune clé active'}</div></td>
                <td>{live?.last_checked_at ? new Date(live.last_checked_at).toLocaleString('fr-FR') : 'Pas encore contrôlée'}</td>
                <td style={{ maxWidth: 280, whiteSpace: 'normal' }}>{live?.last_error ?? row.hint ?? '—'}</td>
                <td><a href={billing.url} target="_blank" rel="noreferrer" style={{ color: '#c4b5fd', fontWeight: 800 }}>{billing.label}</a></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ marginTop: 0 }}>Notifications push — livraison réelle</h3>
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.55 }}>
          KEEP distingue maintenant la création, l’acceptation par Expo et le reçu final. Un appareil désinscrit est retiré automatiquement quand Expo renvoie <strong>DeviceNotRegistered</strong>.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(145px,1fr))', gap: 10, marginBottom: 16 }}>
          {['TOKENS_REGISTERED', 'CREATED', 'NO_DEVICE', 'SENT', 'DELIVERED', 'FAILED', 'ATTEMPTS_24H'].map((status) => (
            <div key={status} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--bg-card)' }}>
              <div style={{ color: PUSH_TONES[status], fontSize: 22, fontWeight: 900 }}>{pushByStatus.get(status) ?? 0}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 3 }}>{PUSH_LABELS[status]}</div>
            </div>
          ))}
        </div>
        {!loading && (pushByStatus.get('TOKENS_REGISTERED') ?? 0) === 0 && (
          <div className="demo-banner" style={{ borderColor: '#f59e0b', marginBottom: 14 }}>
            Aucun téléphone réel n’a encore enregistré de token Expo. Les notifications in-app existent, mais aucun push système ne peut être livré tant qu’un build iPhone/Android n’a pas enregistré son appareil.
          </div>
        )}
        <table>
          <thead><tr><th>Utilisateur</th><th>Notification</th><th>État</th><th>Tentatives</th><th>Créée</th><th>Erreur / livraison</th></tr></thead>
          <tbody>
            {!loading && pushRecent.length === 0 && <tr><td colSpan={6}>Aucune notification.</td></tr>}
            {pushRecent.slice(0, 25).map((row) => <tr key={row.notification_id}>
              <td>{row.username ? `@${row.username}` : '—'}</td>
              <td style={{ maxWidth: 240, whiteSpace: 'normal' }}>{row.title}</td>
              <td><strong style={{ color: PUSH_TONES[row.delivery_status] ?? 'var(--text)' }}>{PUSH_LABELS[row.delivery_status] ?? row.delivery_status}</strong></td>
              <td>{row.attempt_count ?? 0}</td>
              <td>{new Date(row.created_at).toLocaleString('fr-FR')}</td>
              <td style={{ maxWidth: 300, whiteSpace: 'normal' }}>
                {row.last_error ?? (row.delivered_at ? `Livrée ${new Date(row.delivered_at).toLocaleString('fr-FR')}` : '—')}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Numéros abonnés KEEP</h3>
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.55 }}>
          Chaque profil reçoit maintenant un numéro support permanent. Exemple : <strong>KEEP-100001</strong>. Le client peut donner ce numéro au support sans communiquer son identifiant technique interne.
        </p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher par KEEP-100001, pseudo ou e-mail…"
          style={{ width: '100%', boxSizing: 'border-box', marginBottom: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 14px' }}
        />
        <table>
          <thead><tr><th>N° support</th><th>Utilisateur</th><th>E-mail</th><th>Plan</th><th>KEEP ce mois</th><th>Créé le</th></tr></thead>
          <tbody>
            {!loading && filteredUsers.length === 0 && <tr><td colSpan={6}>Aucun utilisateur trouvé.</td></tr>}
            {filteredUsers.map((u) => <tr key={u.id}>
              <td><strong>KEEP-{u.support_number}</strong></td>
              <td><strong>@{u.username}</strong>{u.display_name ? <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{u.display_name}</div> : null}</td>
              <td>{u.email ?? '—'}</td>
              <td>{u.plan_code || 'FREE'}</td>
              <td>{u.keeps_this_month ?? 0}</td>
              <td>{new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
