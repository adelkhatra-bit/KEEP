import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';

interface RemoteConfigRow {
  key: string;
  value: unknown;
  description: string | null;
  updated_at?: string | null;
}

type GroupKey = 'LEGAL' | 'GROWTH' | 'PLANS' | 'SERVICES' | 'LISTEN' | 'VIBES' | 'OTHER';

const FRIENDLY_LABELS: Record<string, string> = {
  guest_success_limit: 'Morceaux offerts avant inscription',
  signup_bonus_successes: 'Morceaux offerts après inscription',
  growth_share_daily_cap: 'Partages comptés maximum / jour',
  growth_share_tier1_threshold: 'Partages · palier 1',
  growth_share_tier2_threshold: 'Partages · palier 2',
  growth_share_tier3_threshold: 'Partages · palier 3',
  growth_share_reward_20: 'Bonus Découvertes du palier partages',
  growth_share_reward_50: 'Bonus crédits du palier partages 2',
  growth_share_reward_100: 'Bonus crédits du palier partages 3',
  growth_followers_tier1_threshold: 'Abonnés · palier 1',
  growth_followers_tier2_threshold: 'Abonnés · palier 2',
  growth_followers_tier3_threshold: 'Abonnés · palier 3',
  growth_followers_tier4_threshold: 'Abonnés · palier 4',
  growth_followers_tier5_threshold: 'Abonnés · palier Audience Pro',
  growth_followers_reward_25_discovery: 'Bonus Découvertes · abonnés palier 1',
  growth_followers_reward_100_sort: 'Essais Vibes · abonnés palier 2',
  growth_followers_reward_250_credits: 'Bonus crédits · abonnés palier 3',
  growth_followers_reward_500_discovery: 'Bonus Découvertes · abonnés palier 4',
  growth_followers_reward_500_sort: 'Essais Vibes · abonnés palier 4',
  growth_followers_reward_1000_credits: 'Bonus crédits · Audience Pro',
  music_services_limit_free: 'Services musicaux · FREE',
  music_services_limit_premium: 'Services musicaux · Premium 2,99 €',
  music_services_limit_creator: 'Services musicaux · Creator Pro 9,99 €',
  music_services_limit_venue: 'Services musicaux · Venue Pro 29,99 €',
  free_monthly_bonus_free: 'Free offerts / mois · formule Free',
  free_monthly_bonus_premium: 'Free offerts / mois · Premium 2,99 €',
  free_monthly_bonus_creator_pro: 'Free offerts / mois · Creator Pro 9,99 €',
  free_monthly_bonus_venue_pro: 'Free offerts / mois · Venue Pro 29,99 €',
  session_empty_title: 'Écouter · titre au repos',
  session_empty_subtitle: 'Écouter · texte au repos',
  session_silence_timeout_minutes: 'Silence avant proposition d’arrêt (min)',
  smart_album_config: 'Configuration Loki Vibes automatique',
  legal_publisher_name: 'Nom de l’éditeur (mentions légales/CGU)',
  legal_publisher_contact: 'Contact de l’éditeur (mentions légales)',
};

function editableValue(row: RemoteConfigRow) {
  return typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
}

function groupFor(key: string): GroupKey {
  if (key.startsWith('legal_')) return 'LEGAL';
  if (key.startsWith('growth_')) return 'GROWTH';
  if (key.startsWith('music_services_')) return 'SERVICES';
  if (key.startsWith('guest_') || key.startsWith('signup_') || key.startsWith('free_monthly_bonus_') || key.includes('download') || key.includes('discovery_profile') || key.includes('sort_trial')) return 'PLANS';
  if (key.startsWith('session_') || key.startsWith('auth_')) return 'LISTEN';
  if (key.startsWith('smart_album')) return 'VIBES';
  return 'OTHER';
}

const GROUPS: Array<{ key: GroupKey; title: string; subtitle: string }> = [
  { key: 'LEGAL', title: 'Informations légales', subtitle: 'Nom et contact affichés dans les mentions légales, CGU et politique de confidentialité publiques -- un seul changement ici met à jour toutes les pages automatiquement, sans republier l’app.' },
  { key: 'GROWTH', title: 'Croissance Free · paliers & cadeaux', subtitle: 'Transforme partages et abonnés en bonus sans modifier l’application. Les règles serveur utilisent ces valeurs.' },
  { key: 'PLANS', title: 'Essai, crédits & limites', subtitle: 'Réglages transversaux. Les limites propres à chaque formule se gèrent aussi dans Abonnements, Prix & Quotas.' },
  { key: 'SERVICES', title: 'Services musicaux · emplacements par formule', subtitle: 'Nombre maximum de services qu’un compte peut choisir. Un service confirmé reste attaché au compte ; augmente une limite ici sans republier l’application.' },
  { key: 'LISTEN', title: 'Écouter & compte', subtitle: 'Textes et comportement à distance de l’écran Écouter.' },
  { key: 'VIBES', title: 'Loki Vibes', subtitle: 'Configuration du rangement musical intelligent.' },
  { key: 'OTHER', title: 'Configuration avancée', subtitle: 'Autres réglages distants.' },
];

export default function RemoteConfig() {
  const [rows, setRows] = useState<RemoteConfigRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true); setError(null);
    try {
      if (!supabase) throw new Error('Supabase Super Admin non configuré.');
      const { data, error: rpcError } = await supabase.rpc('admin_remote_config_list');
      if (rpcError) throw rpcError;
      setRows((data ?? []) as RemoteConfigRow[]);
    } catch (e: any) { setError(e?.message ?? 'Échec du chargement de la configuration.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);
  const grouped = useMemo(() => Object.fromEntries(GROUPS.map((group) => [group.key, rows.filter((row) => groupFor(row.key) === group.key)])) as Record<GroupKey, RemoteConfigRow[]>, [rows]);
  const draftFor = (row: RemoteConfigRow) => drafts[row.key] ?? editableValue(row);

  const save = async (row: RemoteConfigRow) => {
    if (!supabase) return;
    setSavingKey(row.key); setError(null);
    try {
      const raw = draftFor(row);
      let value: unknown = raw;
      if (typeof row.value !== 'string') {
        try { value = JSON.parse(raw); }
        catch { throw new Error('Valeur JSON invalide.'); }
      }
      const { error: rpcError } = await supabase.rpc('admin_remote_config_set', { p_key: row.key, p_value: value, p_description: row.description });
      if (rpcError) throw rpcError;
      setSavedNote((notes) => ({ ...notes, [row.key]: `Enregistré à ${new Date().toLocaleTimeString('fr-FR')}` }));
      await load();
    } catch (e: any) { setError(e?.message ?? "Échec de l'enregistrement."); }
    finally { setSavingKey(null); }
  };

  return <AdminLayout>
    <div className="page-title">Textes, Paliers & Règles Loki</div>
    <div className="page-subtitle">Pilote les cadeaux Free, la croissance communautaire, les services musicaux, Écouter et Loki Vibes directement depuis Supabase.</div>

    {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
    {!error && !loading && <div className="demo-banner">● MODE RÉEL — chaque changement est audité et appliqué sans republier l’application.</div>}
    {loading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Chargement…</p>}

    {!loading && GROUPS.map((group) => {
      const items = grouped[group.key] ?? [];
      if (!items.length) return null;
      return <section key={group.key} style={{ marginTop: 22 }}>
        <div style={{ marginBottom: 10 }}><h2 style={{ margin: 0 }}>{group.title}</h2><p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: 13 }}>{group.subtitle}</p></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(310px,1fr))', gap: 12 }}>
          {items.map((row) => {
            const longText = typeof row.value === 'string' && row.value.length > 60;
            const numeric = typeof row.value === 'number';
            return <div key={row.key} style={{ background: '#110d19', border: '1px solid #302742', borderRadius: 14, padding: 14 }}>
              <div style={{ fontWeight: 900, marginBottom: 3 }}>{FRIENDLY_LABELS[row.key] ?? row.key.replace(/_/g, ' ')}</div>
              <div style={{ fontFamily: 'monospace', color: '#716879', fontSize: 10, marginBottom: 8 }}>{row.key}</div>
              {longText ? <textarea value={draftFor(row)} onChange={(e) => setDrafts((d) => ({ ...d, [row.key]: e.target.value }))} rows={3} style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 10px', fontSize: 13 }} /> : <input type={numeric ? 'number' : 'text'} value={draftFor(row)} onChange={(e) => setDrafts((d) => ({ ...d, [row.key]: e.target.value }))} style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 10px', fontSize: 13 }} />}
              {row.description && <div style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.45, marginTop: 7 }}>{row.description}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <button onClick={() => void save(row)} disabled={savingKey === row.key} style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 14px', fontWeight: 800, cursor: savingKey === row.key ? 'wait' : 'pointer' }}>{savingKey === row.key ? '…' : 'Enregistrer'}</button>
                {savedNote[row.key] && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{savedNote[row.key]}</span>}
              </div>
            </div>;
          })}
        </div>
      </section>;
    })}
  </AdminLayout>;
}
