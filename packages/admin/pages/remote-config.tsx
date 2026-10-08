import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import Hint from '../components/Hint';
import PresetPicker, { PRESETS } from '../components/PresetPicker';
import { supabase } from '../lib/supabaseClient';

interface RemoteConfigRow {
  key: string;
  value: unknown;
  description: string | null;
  updated_at?: string | null;
}

type GroupKey = 'GAINS' | 'SPEND' | 'BATTLE' | 'LEGAL' | 'GROWTH' | 'PLANS' | 'SERVICES' | 'LISTEN' | 'VIBES' | 'OTHER';

/**
 * Économie FREE (audit 07/10/2026, Adel : « j'ai la main sur tout ce qui fait gagner ou dépenser des FREE ») :
 * chaque clé réellement lue par le serveur, un mot à l'écran + l'explication derrière le « ? ».
 */
const ECONOMY: Record<string, { group: 'GAINS' | 'SPEND' | 'BATTLE'; label: string; help: string }> = {
  guest_success_limit: { group: 'GAINS', label: 'Départ', help: 'FREE de départ comptés dans le solde de CHAQUE compte (héritage des écoutes invité). Changer ce chiffre change le solde de tous les comptes.' },
  listen_streak_daily_free: { group: 'GAINS', label: 'Série', help: 'FREE gagnés au premier morceau reconnu de chaque jour.' },
  listen_streak_day7_bonus_free: { group: 'GAINS', label: 'Série 7 j', help: 'Bonus de FREE au 7e jour de suite avec au moins un morceau reconnu.' },
  first_discovery_free_per_keep: { group: 'GAINS', label: 'Découvreur', help: 'FREE gagnés quand un autre membre garde un morceau que tu as découvert en premier.' },
  first_discovery_monthly_free_cap: { group: 'GAINS', label: 'Plafond', help: 'Maximum de FREE « Découvreur » gagnés par mois.' },
  referral_free_per_signup: { group: 'GAINS', label: 'Parrain', help: 'FREE gagnés par le parrain pour chaque ami inscrit avec son lien ou son QR code. Le nouvel inscrit ne reçoit que le bonus d’inscription.' },
  referral_monthly_free_cap: { group: 'GAINS', label: 'Plafond parrain', help: 'Maximum de FREE gagnés par parrainage chaque mois.' },
  growth_followers_reward_250_credits: { group: 'GAINS', label: 'Abonnés', help: 'FREE gagnés une fois en atteignant le palier « Abonnés · palier 3 » (réglable dans Croissance).' },
  growth_followers_reward_1000_credits: { group: 'GAINS', label: 'Audience Pro', help: 'FREE gagnés une fois en atteignant le palier Audience Pro (réglable dans Croissance).' },
  listen_over_quota_free_cost: { group: 'SPEND', label: 'Écoute +', help: 'FREE retirés pour chaque nouveau morceau reconnu au-delà du quota du jour (avec l’accord de l’utilisateur). Une reconnaissance ratée ne coûte rien.' },
  free_cost_per_keep: { group: 'SPEND', label: 'Garder', help: 'FREE retirés quand un utilisateur garde un morceau reconnu.' },
  battle_free_credit_enabled: { group: 'BATTLE', label: 'Mises', help: 'Active ou coupe les mises en FREE dans les Battle.' },
  battle_arena_stake_free_credits: { group: 'BATTLE', label: 'Mise', help: 'FREE misés par joueur pour un Battle en ligne de 8 manches (proportionnel au nombre de manches). Le gagnant remporte les mises des perdants.' },
  battle_arena_min_free_required: { group: 'BATTLE', label: 'Minimum', help: 'FREE minimum dans le solde pour entrer dans un Battle en ligne.' },
  battle_arena_max_players: { group: 'BATTLE', label: 'Joueurs', help: 'Nombre maximum de joueurs dans un Battle en ligne.' },
  battle_invites_per_day: { group: 'BATTLE', label: 'Invitations', help: 'Invitations Battle envoyées au maximum par jour (anti-spam).' },
  battle_solo_daily_limit_free: { group: 'BATTLE', label: 'Solo Free', help: 'Parties SOLO par jour pour un compte Free.' },
  battle_solo_daily_limit_premium: { group: 'BATTLE', label: 'Solo Premium', help: 'Parties SOLO par jour pour un abonné Premium.' },
  battle_solo_daily_limit_creator_pro: { group: 'BATTLE', label: 'Solo Creator', help: 'Parties SOLO par jour pour un abonné Creator Pro.' },
  battle_solo_daily_limit_venue_pro: { group: 'BATTLE', label: 'Solo Venue', help: 'Parties SOLO par jour pour un abonné Venue Pro.' },
  battle_solo_pack_small_solos: { group: 'BATTLE', label: 'Petit pack', help: 'Nombre de parties SOLO ajoutées par le petit pack (« Recharger mes Solos »).' },
  battle_solo_pack_small_free: { group: 'BATTLE', label: 'Prix petit', help: 'Prix du petit pack en FREE, retiré du solde à l’achat.' },
  battle_solo_pack_large_solos: { group: 'BATTLE', label: 'Grand pack', help: 'Nombre de parties SOLO ajoutées par le grand pack.' },
  battle_solo_pack_large_free: { group: 'BATTLE', label: 'Prix grand', help: 'Prix du grand pack en FREE, retiré du solde à l’achat.' },
  battle_preview_start_sec: { group: 'BATTLE', label: 'Début extrait', help: 'Position dans le fichier audio, en secondes (0 à 20, défaut 12). Ce n’est pas un délai avant lecture. Même position en SOLO et en ligne.' },
};

/**
 * Clés masquées (anti-doublon / anti-réglage trompeur, audit 07/10/2026) :
 * - réglées UNIQUEMENT dans Formules : guest_recognition_limit, signup_bonus_recognitions, free_monthly_bonus_* (recopiées par Formules) ;
 * - sans effet sur le serveur aujourd’hui (aucune lecture) ou anciennes règles : les afficher ferait croire qu’elles agissent.
 */
const HIDDEN_KEYS = new Set([
  'guest_recognition_limit', 'signup_bonus_recognitions', 'signup_bonus_successes',
  'free_monthly_bonus_free', 'free_monthly_bonus_premium', 'free_monthly_bonus_creator_pro', 'free_monthly_bonus_venue_pro',
  'growth_share_reward_50', 'growth_share_reward_100', 'referral_bonus_3', 'referral_bonus_5', 'referral_bonus_10',
  'battle_arena_payout_share_rank1', 'listen_streak_paid_freeze_per_month', 'battle_win_free_credits', 'battle_loss_free_credits',
  'battle_duel_perfect_bonus_free', 'listen_pricing_draft_extra_cost', 'listen_pricing_draft_free_per_day', 'battle_solo_daily_limit',
]);

const FRIENDLY_LABELS: Record<string, string> = {
  guest_success_limit: 'Morceaux offerts avant inscription',
  demo_listen_limit: 'Mode démo · écoutes maximum avant compte',
  demo_discovery_locked: 'Mode démo · verrouiller Découvertes',
  signup_bonus_successes: 'Morceaux offerts après inscription',
  battle_solo_daily_limit_free: 'Battle SOLO · parties par jour (formule gratuite)',
  battle_solo_daily_limit_premium: 'Battle SOLO · parties par jour (Premium)',
  battle_solo_daily_limit_creator_pro: 'Battle SOLO · parties par jour (Créateur Pro)',
  battle_solo_daily_limit_venue_pro: 'Battle SOLO · parties par jour (Lieu Pro)',
  battle_solo_pack_small_solos: 'Battle SOLO · petit pack : nombre de Solos ajoutés (« Recharger mes Solos »)',
  battle_solo_pack_small_free: 'Battle SOLO · petit pack : prix en Free (retiré du solde du joueur à l’achat)',
  battle_solo_pack_large_solos: 'Battle SOLO · grand pack : nombre de Solos vendus',
  battle_solo_pack_large_free: 'Battle SOLO · grand pack : prix en Free (retiré du solde du joueur à l’achat)',
  battle_preview_start_sec: 'Début extrait',
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
  // Adel (04/09/2026) : "je sais pas comment t'as calculé ton coût pour le
  // lien d'affiliation ... il faut que je puisse l'avoir dans les
  // paramètres" -- ces 5 clés existaient déjà côté serveur
  // (keep_referral_rules, utilisées par l'écran Inviter un ami / QR code
  // de parrainage) mais n'avaient ni libellé ni groupe ici : elles
  // tombaient dans "Configuration avancée" sans explication.
  referral_free_per_signup: 'Free gagnés par filleul inscrit via mon lien',
  referral_bonus_3: 'Bonus Free au 3ᵉ filleul inscrit ce mois',
  referral_bonus_5: 'Bonus Free au 5ᵉ filleul inscrit ce mois',
  referral_bonus_10: 'Bonus Free au 10ᵉ filleul inscrit ce mois',
  referral_monthly_free_cap: 'Plafond de Free gagnés par parrainage / mois',
  music_services_limit_free: 'Services musicaux · FREE',
  music_services_limit_premium: 'Services musicaux · Premium 2,99 €',
  music_services_limit_creator: 'Services musicaux · Creator Pro 9,99 €',
  music_services_limit_venue: 'Services musicaux · Venue Pro 29,99 €',
  free_monthly_bonus_free: 'Free offerts / mois · formule Free',
  free_monthly_bonus_premium: 'Free offerts / mois · Premium 2,99 €',
  free_monthly_bonus_creator_pro: 'Free offerts / mois · Creator Pro 9,99 €',
  free_monthly_bonus_venue_pro: 'Free offerts / mois · Venue Pro 29,99 €',
  free_cost_per_keep: 'Prix en Free d’un morceau gardé (FREE/Premium)',
  battle_arena_stake_free_credits: 'Mise en Free pour un Battle en ligne',
  battle_duel_perfect_bonus_free: 'Bonus plateforme · victoire parfaite en Battle à 2 (Free)',
  // Adel (04/09/2026) : "c'est deloyal qui perdent tous ... le premier
  // gagne un truc, le deuxieme peut gagner un truc aussi" -- a partir de 3
  // joueurs dans un Battle collectif, le pot des perdants (3e place et
  // au-dela) est desormais partage entre le 1er et le 2e selon ce %.
  battle_arena_payout_share_rank1: 'Part du gagnant sur le podium (Battle à 3 joueurs et +, % — le reste va au 2e)',
  // Adel (04/09/2026) : suite de "rien n'empêche d'envoyer des invites en
  // boucle" -- plafond anti-spam global (tous destinataires confondus),
  // distinct du plafond par formule/par mois de matchs joués.
  battle_invites_per_day: 'Invitations Battle envoyées maximum / jour (anti-spam)',
  session_empty_title: 'Écouter · titre au repos',
  session_empty_subtitle: 'Écouter · texte au repos',
  session_silence_timeout_minutes: 'Silence avant proposition d’arrêt (min)',
  smart_album_config: 'Configuration Loki Music Vibes automatique',
  legal_publisher_name: 'Nom de l’éditeur (mentions légales/CGU)',
  legal_publisher_contact: 'Contact de l’éditeur (mentions légales)',
};

function editableValue(row: RemoteConfigRow) {
  return typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
}

function groupFor(key: string): GroupKey {
  if (ECONOMY[key]) return ECONOMY[key].group;
  if (key.startsWith('legal_')) return 'LEGAL';
  if (key.startsWith('growth_') || key.startsWith('referral_')) return 'GROWTH';
  if (key.startsWith('music_services_')) return 'SERVICES';
  if (key.startsWith('guest_') || key.startsWith('signup_') || key.startsWith('free_monthly_bonus_') || key.startsWith('free_cost_') || key.startsWith('battle_') || key.includes('download') || key.includes('discovery_profile') || key.includes('sort_trial')) return 'PLANS';
  if (key.startsWith('session_') || key.startsWith('auth_') || key.startsWith('demo_')) return 'LISTEN';
  if (key.startsWith('smart_album')) return 'VIBES';
  return 'OTHER';
}

const GROUPS: Array<{ key: GroupKey; title: string; subtitle: string }> = [
  { key: 'GAINS', title: 'Gagner', subtitle: 'Tout ce qui fait GAGNER des FREE aux utilisateurs. Le bonus d’inscription et les FREE mensuels des abonnés se règlent dans Formules. Partager son profil ne donne pas de FREE : les paliers de partage donnent des Découvertes et des essais Vibes (Croissance).' },
  { key: 'SPEND', title: 'Dépenser', subtitle: 'Tout ce qui fait DÉPENSER des FREE.' },
  { key: 'BATTLE', title: 'Battle', subtitle: 'Mises, parties SOLO et packs. Le gain SOLO parfait (3 / 6 / 8 / 12 FREE selon le nombre de manches) est encore fixé dans le serveur : il deviendra réglable ici avec ton « OK base ».' },
  { key: 'LEGAL', title: 'Légal', subtitle: 'Nom et contact affichés dans les mentions légales, CGU et politique de confidentialité publiques -- un seul changement ici met à jour toutes les pages automatiquement, sans republier l’app.' },
  { key: 'GROWTH', title: 'Croissance', subtitle: 'Transforme partages, abonnés ET parrainage (lien d’affiliation / QR code, "Inviter un ami") en bonus Free, sans modifier l’application. Les règles serveur (keep_referral_rules) utilisent ces mêmes valeurs.' },
  { key: 'PLANS', title: 'Crédits', subtitle: 'Réglages transversaux. Écoutes invité, bonus d’inscription, FREE mensuels, prix et limites par formule : page Formules.' },
  { key: 'SERVICES', title: 'Services', subtitle: 'Nombre maximum de services qu’un compte peut choisir. Un service confirmé reste attaché au compte ; augmente une limite ici sans republier l’application.' },
  { key: 'LISTEN', title: 'Écouter', subtitle: 'Textes et comportement à distance de l’écran Écouter.' },
  { key: 'VIBES', title: 'Vibes', subtitle: 'Configuration du rangement musical intelligent.' },
  { key: 'OTHER', title: 'Avancé', subtitle: 'Autres réglages distants.' },
];

const MANAGED_IN_PLANS = (key: string) => HIDDEN_KEYS.has(key);

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
  // Anti-doublon (07/10/2026) : écoutes invité et bonus d’inscription se règlent UNIQUEMENT dans Formules (même donnée en base).
  const grouped = useMemo(() => Object.fromEntries(GROUPS.map((group) => [group.key, rows.filter((row) => !MANAGED_IN_PLANS(row.key) && groupFor(row.key) === group.key)])) as Record<GroupKey, RemoteConfigRow[]>, [rows]);
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
      if (row.key === 'battle_preview_start_sec' && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 20)) throw new Error('Position autorisée : 0 à 20 secondes.');
      const { error: rpcError } = await supabase.rpc('admin_remote_config_set', { p_key: row.key, p_value: value, p_description: row.description });
      if (rpcError) throw rpcError;
      setSavedNote((notes) => ({ ...notes, [row.key]: `Enregistré à ${new Date().toLocaleTimeString('fr-FR')}` }));
      await load();
    } catch (e: any) { setError(e?.message ?? "Échec de l'enregistrement."); }
    finally { setSavingKey(null); }
  };

  return <AdminLayout>
    <div className="page-title">Réglages <Hint title="Réglages" text={<>Pilote les cadeaux Free, la croissance communautaire, les services musicaux, Écouter et Loki Music Vibes directement depuis Supabase.</>}/></div>

    {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
    {!error && !loading && <div className="demo-banner"><span className="real-pill">● Réel <Hint title="Mode réel" text="Chaque changement est audité et appliqué sans republier l’application."/></span></div>}
    {loading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Chargement…</p>}

    {!loading && GROUPS.map((group) => {
      const items = grouped[group.key] ?? [];
      if (!items.length) return null;
      return <section key={group.key} style={{ marginTop: 22 }}>
        <div style={{ marginBottom: 10 }}><h2 style={{ margin: 0 }}>{group.title}<Hint title={group.title} text={group.subtitle}/></h2></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(310px,1fr))', gap: 12 }}>
          {items.map((row) => {
            const longText = typeof row.value === 'string' && row.value.length > 60;
            const numeric = typeof row.value === 'number';
            return <div key={row.key} style={{ background: '#110d19', border: '1px solid #302742', borderRadius: 14, padding: 14 }}>
              <div style={{ fontWeight: 900, marginBottom: 8, display: 'flex', alignItems: 'center' }}>{ECONOMY[row.key]?.label ?? FRIENDLY_LABELS[row.key] ?? row.key.replace(/_/g, ' ')}{ECONOMY[row.key] && <Hint title={ECONOMY[row.key].label} text={ECONOMY[row.key].help}/>}</div>
              {numeric ? <PresetPicker label={ECONOMY[row.key]?.label ?? FRIENDLY_LABELS[row.key] ?? row.key} value={Number(draftFor(row)) || 0} presets={row.key === 'battle_preview_start_sec' ? [0, 5, 9, 12, 15, 20] : PRESETS.limit} onChange={(v) => setDrafts((d) => ({ ...d, [row.key]: String(v ?? 0) }))} width={160} impact={(v) => `${ECONOMY[row.key]?.label ?? FRIENDLY_LABELS[row.key] ?? row.key} passera à ${v ?? 0} pour tous les utilisateurs, sans mise à jour de l’app. ${ECONOMY[row.key]?.help ?? row.description ?? ''}`} /> : longText ? <textarea value={draftFor(row)} onChange={(e) => setDrafts((d) => ({ ...d, [row.key]: e.target.value }))} rows={3} style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 10px', fontSize: 13 }} /> : <input type={numeric ? 'number' : 'text'} value={draftFor(row)} onChange={(e) => setDrafts((d) => ({ ...d, [row.key]: e.target.value }))} style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 10px', fontSize: 13 }} />}
              {!ECONOMY[row.key] && row.description && <Hint text={<>{row.description}</>}/>}
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
