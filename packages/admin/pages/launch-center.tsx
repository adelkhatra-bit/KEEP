import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';
import { invokeAdminFunction } from '../lib/invokeFunction';
import { openProviderPopup } from '../lib/providerWindow';

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
    detail: 'Obligatoire pour signer et publier Loki Music sur iPhone.', action: 'OUVRIR ET PAYER',
    url: 'https://developer.apple.com/account/',
  },
  {
    name: 'Supabase', plan: 'Pro — 1 projet Micro', price: '25 USD / mois', required: true,
    detail: 'Production sans mise en veille, sauvegardes quotidiennes et quotas adaptés.', action: 'CHOISIR PRO',
    url: 'https://supabase.com/dashboard/org/_/billing',
  },
  {
    name: 'Vercel', plan: 'Pro — 1 siège', price: '20 USD / mois', required: true,
    detail: 'Backend commercial Loki Music et crédit d’usage mensuel inclus.', action: 'CHOISIR PRO',
    url: 'https://vercel.com/account/billing',
  },
  {
    name: 'Expo EAS', plan: 'Free au lancement', price: '0 USD / mois', required: false,
    detail: '15 builds iOS mensuels et soumission App Store incluses : ne rien acheter maintenant.', action: 'OUVRIR EXPO',
    url: 'https://expo.dev/accounts',
  },
  {
    name: 'Google Cloud / YouTube', plan: 'YouTube Data API', price: '0 USD au quota standard', required: false,
    detail: 'OAuth lecture seule pour faire remonter les likes YouTube dans les sessions Loki Music.', action: 'CONFIGURER OAUTH',
    url: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
  },
  {
    name: 'AudD', plan: 'Optionnel · paiement à l’usage', price: 'Selon ton offre AudD', required: false,
    detail: 'Moteur complémentaire. Un abonnement AudD ne connecte pas automatiquement Loki : la clé API doit être enregistrée dans Intégrations si tu veux l’activer.', action: 'GÉRER AUDD',
    url: 'https://dashboard.audd.io/',
  },
  {
    name: 'ACRCloud', plan: 'Moteur serveur principal', price: 'Selon ton offre ACRCloud', required: false,
    detail: 'Moteur serveur actuellement utilisé par Loki pour compléter ShazamKit et la mémoire musicale.', action: 'GÉRER ACRCLOUD',
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
  // Persisted admin launch checklist: shared through Supabase across browsers/devices.
  const [manualSavedAt, setManualSavedAt] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      if (!supabase) throw new Error('Supabase Super Admin non configuré.');
      const [integrationResult, runtimeResult, configResult] = await Promise.all([
        invokeAdmin({ action: 'integrations.list' }),
        supabase.rpc('admin_integration_runtime_status'),
        supabase.rpc('admin_remote_config_list'),
      ]);
      if (runtimeResult.error) throw runtimeResult.error;
      if (configResult.error) throw configResult.error;
      setIntegrations((integrationResult?.data ?? []) as IntegrationRow[]);
      setRuntime((runtimeResult.data ?? []) as RuntimeRow[]);
      const persisted = ((configResult.data ?? []) as Array<{key:string;value:any;updated_at?:string}>).find((row) => row.key === 'admin_launch_manual_checks');
      if (persisted?.value && typeof persisted.value === 'object') {
        setManual((current) => ({ ...current, ...(persisted.value as Record<ManualKey, boolean>) }));
        setManualSavedAt(persisted.updated_at || null);
      } else {
        try {
          const saved = JSON.parse(localStorage.getItem('loki-launch-manual-v1') || '{}');
          setManual((current) => ({ ...current, ...saved }));
        } catch {}
      }
    } catch (e: any) { setError(e?.message ?? 'Analyse impossible.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const setManualState = async (key: ManualKey, checked: boolean) => {
    if (!supabase) return setError('Supabase Super Admin non configuré.');
    const next = { ...manual, [key]: checked };
    setManual(next);
    setError(null);
    try {
      const { error: saveError } = await supabase.rpc('admin_remote_config_set', {
        p_key: 'admin_launch_manual_checks',
        p_value: next,
        p_description: 'Validations manuelles du Centre de lancement Loki Music, persistées pour tous les appareils Super Admin.',
      });
      if (saveError) throw saveError;
      localStorage.setItem('loki-launch-manual-v1', JSON.stringify(next));
      setManualSavedAt(new Date().toISOString());
    } catch (e: any) {
      setError(e?.message ?? 'Impossible d’enregistrer cette validation dans Supabase.');
      await load();
    }
  };

  const configured = useMemo(() => new Set(integrations.filter((row) => row.configured).map((row) => row.key)), [integrations]);
  const secretsReady = REQUIRED_SECRETS.filter((key) => configured.has(key)).length;
  const runtimeFailures = runtime.filter((row) => /ERROR|FAILED|EXHAUSTED|REVOKED/i.test(`${row.status} ${row.last_error ?? ''}`));
  const manualReady = MANUAL.filter((item) => manual[item.key]).length;
  const totalReady = secretsReady + manualReady + (runtimeFailures.length === 0 ? 1 : 0);
  const totalChecks = REQUIRED_SECRETS.length + MANUAL.length + 1;
  const ready = totalReady === totalChecks;

  return <AdminLayout>
    <div className="page-title">Centre de lancement Loki Music</div>
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
      <p style={{ color: 'var(--text-muted)' }}>Chaque bouton ouvre le compte officiel sur le bon écran. Loki Music ne collecte jamais ta carte bancaire et ne revend aucun abonnement.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(245px,1fr))', gap: 12 }}>
        {PROVIDERS.map((provider) => <div key={provider.name} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: 'var(--bg-elevated)' }}>
          <div style={{ color: provider.required ? '#ffb454' : '#86efac', fontSize: 10, fontWeight: 900 }}>{provider.required ? 'NÉCESSAIRE AU LANCEMENT' : 'GRATUIT / OPTIONNEL'}</div>
          <h3 style={{ marginBottom: 4 }}>{provider.name}</h3><strong style={{ color: '#c4b5fd' }}>{provider.plan}</strong><div style={{ fontSize: 20, fontWeight: 900, margin: '10px 0' }}>{provider.price}</div>
          <p style={{ minHeight: 54, color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>{provider.detail}</p>
          <button
            type="button"
            onClick={() => openProviderPopup(provider.url, `loki-launch-${provider.name.replace(/\W+/g, '-').toLowerCase()}`)}
            style={{ display: 'inline-block', background: 'var(--primary)', color: '#fff', padding: '10px 14px', borderRadius: 8, fontSize: 11, fontWeight: 900, border: 0, cursor: 'pointer' }}
          >
            {provider.action}
          </button>
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
      <p style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>Ordre Loki Music : ShazamKit sur iPhone → ACRCloud côté serveur → AudD uniquement s’il est explicitement connecté. Pour un lien partagé : métadonnées de la page → catalogues publics → moteur audio si nécessaire. Un échec isolé ne coupe jamais toute l’écoute.</p>
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
        <input type="checkbox" checked={manual[item.key]} onChange={(event) => void setManualState(item.key, event.target.checked)} style={{ width: 18, height: 18, marginTop: 2 }} />
        <span><strong>{item.label}</strong><span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 12, marginTop: 3 }}>{item.detail}</span></span>
      </label>)}
      {manualSavedAt ? <p style={{ color: '#86efac', fontSize: 11, marginBottom: 8 }}>✓ Validations enregistrées dans Supabase · synchronisées entre tes appareils.</p> : null}
      <p style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.5, marginBottom: 0 }}>Sécurité : paiement, 2FA, CAPTCHA, création de clés permanentes et déclarations contractuelles restent validés par le titulaire. Toutes les autres étapes techniques peuvent être préparées et contrôlées par l’assistant.</p>
    </div>
  </AdminLayout>;
}
