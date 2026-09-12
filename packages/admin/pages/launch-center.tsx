import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';
import { invokeAdminFunction } from '../lib/invokeFunction';

type IntegrationRow = { key: string; configured: boolean };
type RuntimeRow = { key: string; status: string; last_checked_at: string | null; last_error: string | null };
type ManualKey = 'apple_membership' | 'shazam_service' | 'store_products' | 'store_contracts' | 'iphone_test';

const MANUAL: Array<{ key: ManualKey; label: string; detail: string }> = [
  { key: 'apple_membership', label: 'Adhésion Apple Developer active', detail: 'Paiement annuel et identité du titulaire validés par Apple.' },
  { key: 'shazam_service', label: 'ShazamKit activé sur le Bundle ID', detail: 'App Service activé pour com.adelkhatra.keep.' },
  { key: 'store_products', label: 'Abonnements créés dans App Store Connect', detail: 'Premium, Creator Pro et Venue Pro avec leurs prix Apple.' },
  { key: 'store_contracts', label: 'Contrats et questionnaires Apple validés', detail: 'Fiscalité, banque, App Privacy, âge, droits musicaux et DSA.' },
  { key: 'iphone_test', label: 'TestFlight validé sur un vrai iPhone', detail: 'Micro, partage YouTube, notifications, achat et restauration testés.' },
];

const PROVIDERS = [
  {
    name: 'Apple Developer', plan: 'Programme individuel', price: '99 USD / an', required: true,
    detail: 'Obligatoire pour signer et publier Loki sur iPhone.', action: 'OUVRIR ET PAYER',
    url: 'https://developer.apple.com/account/',
  },
  {
    name: 'Supabase', plan: 'Pro — 1 projet Micro', price: '25 USD / mois', required: true,
    detail: 'Production sans mise en veille, sauvegardes quotidiennes et quotas adaptés.', action: 'CHOISIR PRO',
    url: 'https://supabase.com/dashboard/org/_/billing',
  },
  {
    name: 'Vercel', plan: 'Pro — 1 siège', price: '20 USD / mois', required: true,
    detail: 'Backend commercial Loki et crédit d’usage mensuel inclus.', action: 'CHOISIR PRO',
    url: 'https://vercel.com/account/billing',
  },
  {
    name: 'Expo EAS', plan: 'Free au lancement', price: '0 USD / mois', required: false,
    detail: '15 builds iOS mensuels et soumission App Store incluses : ne rien acheter maintenant.', action: 'OUVRIR EXPO',
    url: 'https://expo.dev/accounts',
  },
  {
    name: 'Google Cloud / YouTube', plan: 'YouTube Data API', price: '0 USD au quota standard', required: false,
    detail: 'OAuth lecture seule pour faire remonter les likes YouTube dans les sessions Loki.', action: 'CONFIGURER OAUTH',
    url: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
  },
  {
    name: 'AudD', plan: 'Paiement à l’usage', price: '5 USD / 1 000 écoutes', required: false,
    detail: 'Moteur serveur prioritaire hors ShazamKit : 300 essais gratuits, catalogue annoncé de plus de 160 millions de titres.', action: 'CRÉER LE TOKEN',
    url: 'https://dashboard.audd.io/',
  },
  {
    name: 'ACRCloud', plan: 'Secours Music Recognition', price: 'Essai 14 jours puis devis', required: false,
    detail: 'Deuxième moteur indépendant pour maximiser la couverture des morceaux rares, remixés ou mal captés.', action: 'OUVRIR L’ESSAI',
    url: 'https://console.acrcloud.com/',
  },
] as const;

const REQUIRED_SECRETS = [
  'APPLE_IAP_ISSUER_ID', 'APPLE_IAP_KEY_ID', 'APPLE_IAP_PRIVATE_KEY',
  'APPLE_MUSICKIT_TEAM_ID', 'APPLE_MUSICKIT_KEY_ID', 'APPLE_MUSICKIT_PRIVATE_KEY',
];

const invokeAdmin = (body: Record<string, unknown>) => invokeAdminFunction('keep-admin-control', body);

export default function LaunchCenter() {
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [runtime, setRuntime] = useState<RuntimeRow[]>([]);
  const [manual, setManual] = useState<Record<ManualKey, boolean>>({ apple_membership: false, shazam_service: false, store_products: false, store_contracts: false, iphone_test: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      if (!supabase) throw new Error('Supabase Super Admin non configuré.');
      const [integrationResult, runtimeResult] = await Promise.all([
        invokeAdmin({ action: 'integrations.list' }),
        supabase.rpc('admin_integration_runtime_status'),
      ]);
      if (runtimeResult.error) throw runtimeResult.error;
      setIntegrations((integrationResult?.data ?? []) as IntegrationRow[]);
      setRuntime((runtimeResult.data ?? []) as RuntimeRow[]);
    } catch (e: any) { setError(e?.message ?? 'Analyse impossible.'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('loki-launch-manual-v1') || '{}');
      setManual((current) => ({ ...current, ...saved }));
    } catch {}
    void load();
  }, []);

  const setManualState = (key: ManualKey, checked: boolean) => {
    setManual((current) => {
      const next = { ...current, [key]: checked };
      localStorage.setItem('loki-launch-manual-v1', JSON.stringify(next));
      return next;
    });
  };

  const configured = useMemo(() => new Set(integrations.filter((row) => row.configured).map((row) => row.key)), [integrations]);
  const secretsReady = REQUIRED_SECRETS.filter((key) => configured.has(key)).length;
  const runtimeFailures = runtime.filter((row) => /ERROR|FAILED|EXHAUSTED|REVOKED/i.test(`${row.status} ${row.last_error ?? ''}`));
  const manualReady = MANUAL.filter((item) => manual[item.key]).length;
  const totalReady = secretsReady + manualReady + (runtimeFailures.length === 0 ? 1 : 0);
  const totalChecks = REQUIRED_SECRETS.length + MANUAL.length + 1;
  const ready = totalReady === totalChecks;

  return <AdminLayout>
    <div className="page-title">Centre de lancement Loki</div>
    <div className="page-subtitle">Un seul endroit pour choisir les abonnements, ouvrir les comptes officiels et savoir exactement ce qui bloque l’App Store.</div>

    {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
    <div className="card" style={{ marginBottom: 20, borderColor: ready ? '#2de1c2' : '#7c5cfc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div><h2 style={{ margin: 0 }}>{ready ? 'PRÊT POUR LA SOUMISSION' : `${totalReady}/${totalChecks} contrôles prêts`}</h2><p style={{ color: 'var(--text-muted)', marginBottom: 0 }}>Les cases manuelles doivent uniquement être cochées après confirmation visible du fournisseur.</p></div>
        <button onClick={() => void load()} disabled={loading}>{loading ? 'Analyse…' : 'RELANCER L’AUDIT'}</button>
      </div>
      <div style={{ height: 8, background: '#28233a', borderRadius: 8, marginTop: 18, overflow: 'hidden' }}><div style={{ width: `${Math.round(totalReady / totalChecks * 100)}%`, height: '100%', background: ready ? '#2de1c2' : '#7c5cfc' }} /></div>
    </div>

    <div className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ marginTop: 0 }}>Abonnements à sélectionner</h3>
      <p style={{ color: 'var(--text-muted)' }}>Chaque bouton ouvre le compte officiel sur le bon écran. Loki ne collecte jamais ta carte bancaire et ne revend aucun abonnement.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(245px,1fr))', gap: 12 }}>
        {PROVIDERS.map((provider) => <div key={provider.name} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: 'var(--bg-elevated)' }}>
          <div style={{ color: provider.required ? '#ffb454' : '#86efac', fontSize: 10, fontWeight: 900 }}>{provider.required ? 'NÉCESSAIRE AU LANCEMENT' : 'GRATUIT / OPTIONNEL'}</div>
          <h3 style={{ marginBottom: 4 }}>{provider.name}</h3><strong style={{ color: '#c4b5fd' }}>{provider.plan}</strong><div style={{ fontSize: 20, fontWeight: 900, margin: '10px 0' }}>{provider.price}</div>
          <p style={{ minHeight: 54, color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>{provider.detail}</p>
          <a href={provider.url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', background: 'var(--primary)', color: '#fff', padding: '10px 14px', borderRadius: 8, fontSize: 11, fontWeight: 900 }}>{provider.action}</a>
        </div>)}
      </div>
    </div>

    {/* Adel (08/09/2026) : "verifie bien que dans toutes ces rubriques tu
        n'as pas cree des doublons" -- le bouton "TESTER TOUS LES MOTEURS"
        dupliquait exactement /integrations ("Tester tous les moteurs
        maintenant", meme action keep-recognition-admin-test). Un seul
        endroit pour lancer le vrai test desormais ; celui-ci reste un
        etat lu (Cles detectees automatiquement + alerte d'erreur ci-dessous). */}
    <div className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ marginTop: 0 }}>Écoute multi-moteurs</h3>
      <p style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>Ordre Loki : ShazamKit sur iPhone → AudD → ACRCloud. Pour un lien YouTube/TikTok partagé : métadonnées de la page → catalogues Apple/Deezer → empreinte audio si nécessaire. Un échec isolé ne coupe jamais toute l’écoute.</p>
      <a href="/integrations" style={{ display: 'inline-block', padding: '10px 14px', borderRadius: 8, background: 'var(--primary)', color: '#fff', textDecoration: 'none', fontWeight: 800 }}>
        Tester les moteurs dans « Intégrations »
      </a>
    </div>

    <div className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ marginTop: 0 }}>Clés détectées automatiquement</h3>
      <table><thead><tr><th>Paramètre</th><th>État</th></tr></thead><tbody>{REQUIRED_SECRETS.map((key) => <tr key={key}><td>{key}</td><td><strong style={{ color: configured.has(key) ? '#86efac' : '#fb7185' }}>{configured.has(key) ? 'CONFIGURÉ' : 'MANQUANT'}</strong></td></tr>)}</tbody></table>
      {runtimeFailures.length > 0 && <div className="demo-banner" style={{ marginTop: 14, borderColor: '#fb7185' }}>{runtimeFailures.length} intégration(s) en erreur ou quota épuisé. Voir « API payantes & Support ».</div>}
    </div>

    <div className="card">
      <h3 style={{ marginTop: 0 }}>Validations nécessitant ton compte</h3>
      {MANUAL.map((item) => <label key={item.key} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '13px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
        <input type="checkbox" checked={manual[item.key]} onChange={(event) => setManualState(item.key, event.target.checked)} style={{ width: 18, height: 18, marginTop: 2 }} />
        <span><strong>{item.label}</strong><span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 12, marginTop: 3 }}>{item.detail}</span></span>
      </label>)}
      <p style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.5, marginBottom: 0 }}>Sécurité : paiement, 2FA, CAPTCHA, création de clés permanentes et déclarations contractuelles restent validés par le titulaire. Toutes les autres étapes techniques peuvent être préparées et contrôlées par l’assistant.</p>
    </div>
  </AdminLayout>;
}
