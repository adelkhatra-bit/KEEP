import React, { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';

type Country = { code: string; name: string };
type CountRow = { plan?: string; channel?: string; country?: string; count: number };
type DailyRow = { date: string; count: number };
type SignupUser = { id: string; username: string; email: string | null; createdAt: string };
type DashboardData = {
  from: string;
  to: string;
  country: string | null;
  usersTotal: number;
  newUsers: number;
  verifiedEmails: number;
  activePaid: number;
  keeps: number;
  follows: number;
  shares: number;
  eventsCreated: number;
  dailySignups: DailyRow[];
  planMix: CountRow[];
  sharesByChannel: CountRow[];
  countryMix: CountRow[];
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function invokeUserControl(body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase Super Admin non configuré.');
  const { data, error } = await supabase.functions.invoke('keep-admin-user-control', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.message || data.error);
  return data;
}

// Adel (04/09/2026) : "Partage par type y a marqué non renseigné, va savoir
// pourquoi il y en a quatre" -- vérifié en base (product_events.channel) :
// aucune valeur n'est vraiment vide, mais plusieurs versions de l'app ont
// enregistré des codes techniques différents pour la même action
// (ex. "profile_owner_web" vs l'ancien "web_share"), illisibles pour un
// humain. Un seul point de traduction ici plutôt qu'un code brut affiché.
const SHARE_CHANNEL_BASE_LABELS: Record<string, string> = {
  profile_owner: 'Partage de mon profil',
  profile_visitor: 'Partage du profil d’un autre utilisateur',
  track: 'Partage d’un morceau',
  vibe: 'Partage d’une Vibe (playlist)',
  session: 'Partage d’une session',
  compare: 'Partage d’une comparaison DNA',
  event: 'Partage d’un événement',
  other: 'Autre / non catégorisé',
};
function shareChannelLabel(raw: string): string {
  const value = String(raw || '').toLowerCase();
  if (value.includes('mail')) return 'E-mail';
  const suffixMatch = /_(web|native)$/.exec(value);
  const base = suffixMatch ? value.slice(0, -suffixMatch[0].length) : value;
  const suffix = suffixMatch?.[1];
  const suffixLabel = suffix === 'web' ? ' (navigateur)' : suffix === 'native' ? ' (application)' : '';
  if (SHARE_CHANNEL_BASE_LABELS[base]) return SHARE_CHANNEL_BASE_LABELS[base] + suffixLabel;
  // Codes hérités d'avant la refonte du partage unifié (02/09/2026) : garder
  // un libellé compréhensible plutôt que le code technique brut.
  if (value.includes('track')) return 'Partage d’un morceau (ancienne version)';
  if (value === 'web_share') return 'Partage (ancienne version, navigateur)';
  return raw.replace(/_/g, ' ');
}

const SECTION_HELP: Record<string, string> = {
  signups: 'Nombre de nouveaux comptes créés chaque jour sur la période choisie (Du/Au ci-dessus). Un compte de test créé pour vérifier une fonctionnalité compte aussi dans ce total.',
  planMix: 'Nombre d’utilisateurs actuellement sur chaque formule (Free, Premium, Creator Pro, Venue Pro), à l’instant présent — contrairement au reste du tableau de bord, ce chiffre n’est pas limité à la période Du/Au.',
  shares: 'Nombre de partages effectués par type d’action sur la période (partage de profil, de morceau, par e-mail, etc.). Les partages ne coûtent rien à l’utilisateur ; ce tableau sert à voir ce qui circule le plus.',
  countryMix: 'Répartition de tous les comptes par pays déclaré. « Non renseigné » = aucun pays n’a été choisi ou détecté pour ce compte.',
};
function HelpToggle({ id, open, onToggle }: { id: string; open: string | null; onToggle: (id: string) => void }) {
  const active = open === id;
  return (
    <button type="button" onClick={() => onToggle(id)} title={SECTION_HELP[id]} style={{ width: 20, height: 20, borderRadius: 10, border: '1px solid var(--primary)', background: active ? 'var(--primary)' : 'transparent', color: active ? '#fff' : 'var(--primary)', fontSize: 12, fontWeight: 900, cursor: 'pointer', lineHeight: 1, padding: 0, marginLeft: 8 }}>?</button>
  );
}

export default function Dashboard() {
  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setDate(today.getDate() - 29);
  const [from, setFrom] = useState(isoDate(monthAgo));
  const [to, setTo] = useState(isoDate(today));
  const [country, setCountry] = useState('');
  const [countries, setCountries] = useState<Country[]>([]);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openHelp, setOpenHelp] = useState<string | null>(null);
  const toggleHelp = (id: string) => setOpenHelp((current) => (current === id ? null : id));
  // Adel (04/09/2026) : "créer un système de déroulement" -- 30 jours
  // d'inscriptions listées d'un bloc rendaient le tableau interminable.
  // Repliée sur les 7 derniers jours par défaut, dépliable en un clic.
  const [signupsExpanded, setSignupsExpanded] = useState(false);
  // Adel (04/09/2026) : "un bouton pour supprimer un utilisateur précis
  // directement depuis cette liste, sans passer par la page Utilisateurs" --
  // déplier une date charge les comptes créés ce jour-là (admin_dashboard_
  // signup_detail) ; la suppression réutilise l'action "delete" déjà réelle
  // et auditée de keep-admin-user-control (même chemin que la page Utilisateurs).
  const [openSignupDate, setOpenSignupDate] = useState<string | null>(null);
  const [signupUsers, setSignupUsers] = useState<SignupUser[]>([]);
  const [signupUsersLoading, setSignupUsersLoading] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  const toggleSignupDate = async (date: string) => {
    if (openSignupDate === date) { setOpenSignupDate(null); return; }
    setOpenSignupDate(date);
    setSignupUsersLoading(true);
    setSignupUsers([]);
    try {
      if (!supabase) throw new Error('Supabase Super Admin non configuré.');
      const { data: rows, error: rpcError } = await supabase.rpc('admin_dashboard_signup_detail', { p_date: date, p_country: country || null });
      if (rpcError) throw rpcError;
      setSignupUsers((rows ?? []) as SignupUser[]);
    } catch { setSignupUsers([]); }
    finally { setSignupUsersLoading(false); }
  };

  const deleteSignupUser = async (u: SignupUser) => {
    if (typeof window !== 'undefined' && !window.confirm(`Supprimer définitivement @${u.username} ? Profil, musiques, playlists et accès seront supprimés.`)) return;
    setDeletingUserId(u.id);
    try {
      await invokeUserControl({ action: 'delete', profileId: u.id });
      setSignupUsers((rows) => rows.filter((row) => row.id !== u.id));
      await load();
    } catch (e: any) { setError(e?.message ?? 'Suppression impossible.'); }
    finally { setDeletingUserId(null); }
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!supabase) throw new Error('Supabase Super Admin non configuré.');
      const [{ data: countryRows, error: countriesError }, { data: stats, error: statsError }] = await Promise.all([
        supabase.from('countries').select('code,name').order('name'),
        supabase.rpc('admin_dashboard_stats', { p_from: from, p_to: to, p_country: country || null }),
      ]);
      if (countriesError) throw countriesError;
      if (statsError) throw statsError;
      setCountries((countryRows ?? []) as Country[]);
      setData(stats as DashboardData);
    } catch (e: any) {
      setError(e?.message ?? 'Impossible de charger les statistiques réelles.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <AdminLayout>
      <div className="page-title">Dashboard</div>
      <div className="page-subtitle">Statistiques réelles Loki — filtres par période et pays</div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
          <label>Du<br /><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>Au<br /><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label>Pays<br />
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">Tous les pays</option>
              {countries.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
            </select>
          </label>
          <button onClick={() => void load()} disabled={loading}>{loading ? 'Chargement…' : 'Appliquer'}</button>
        </div>
      </div>

      {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
      {!error && data && <div className="demo-banner">● MODE RÉEL — données lues directement depuis Supabase. Les partages sont comptés par type à partir de cette version.</div>}

      {data && (
        <>
          <div className="kpi-grid">
            <div className="kpi-card"><div className="kpi-value">{data.usersTotal}</div><div className="kpi-label">Utilisateurs totaux</div></div>
            <div className="kpi-card"><div className="kpi-value">{data.newUsers}</div><div className="kpi-label">Nouveaux sur la période</div></div>
            <div className="kpi-card"><div className="kpi-value">{data.verifiedEmails}</div><div className="kpi-label">E-mails vérifiés</div></div>
            {/* Adel (04/09/2026) : "mets-la en dessous ... la ligne là en
                dessous de abonnement payant actif" -- ces deux chiffres
                atterrissaient côte à côte dans la grille auto-fit selon la
                largeur d'écran. Une seule carte, empilée verticalement,
                garantit "en dessous" quelle que soit la largeur. */}
            <div className="kpi-card">
              <div className="kpi-value">{data.activePaid}</div><div className="kpi-label">Abonnements payants actifs</div>
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <div className="kpi-value">{data.keeps}</div><div className="kpi-label">Morceaux gardés sur la période</div>
              </div>
            </div>
            <div className="kpi-card"><div className="kpi-value">{data.follows}</div><div className="kpi-label">Nouveaux abonnements / suivis</div></div>
            <div className="kpi-card"><div className="kpi-value">{data.shares}</div><div className="kpi-label">Partages</div></div>
            <div className="kpi-card"><div className="kpi-value">{data.eventsCreated}</div><div className="kpi-label">Événements créés</div></div>
          </div>

          <div className="card" style={{ marginTop: 22 }}>
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center' }}>Inscriptions par jour<HelpToggle id="signups" open={openHelp} onToggle={toggleHelp} /></h3>
            {openHelp === 'signups' && <div style={{ color: '#b79cff', fontSize: 12, lineHeight: 1.4, marginBottom: 10 }}>{SECTION_HELP.signups}</div>}
            <table><thead><tr><th>Date</th><th>Nouveaux utilisateurs</th></tr></thead><tbody>
              {(signupsExpanded ? data.dailySignups : data.dailySignups.slice(-7)).map((row) => <React.Fragment key={row.date}>
                <tr style={{ cursor: row.count > 0 ? 'pointer' : 'default' }} onClick={() => { if (row.count > 0) void toggleSignupDate(row.date); }}>
                  <td>{new Date(`${row.date}T12:00:00`).toLocaleDateString('fr-FR')}{row.count > 0 ? (openSignupDate === row.date ? ' ▾' : ' ▸') : ''}</td>
                  <td>{row.count}</td>
                </tr>
                {openSignupDate === row.date && <tr><td colSpan={2} style={{ background: '#150f21' }}>
                  {signupUsersLoading ? <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Chargement…</span> : signupUsers.length === 0 ? <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Aucun compte trouvé pour cette date.</span> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {signupUsers.map((u) => <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                        <span style={{ flex: 1 }}>@{u.username} {u.email ? `· ${u.email}` : ''}</span>
                        <button type="button" disabled={deletingUserId === u.id} onClick={() => void deleteSignupUser(u)} style={{ background: 'transparent', border: '1px solid #b42318', color: '#ff8a80', borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 800, cursor: deletingUserId === u.id ? 'wait' : 'pointer' }}>{deletingUserId === u.id ? '…' : 'Supprimer'}</button>
                      </div>)}
                    </div>
                  )}
                </td></tr>}
              </React.Fragment>)}
            </tbody></table>
            {data.dailySignups.length > 7 && <button type="button" onClick={() => setSignupsExpanded((v) => !v)} style={{ marginTop: 10, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>{signupsExpanded ? 'Réduire aux 7 derniers jours' : `Afficher les ${data.dailySignups.length} jours`}</button>}
          </div>

          <div className="card" style={{ marginTop: 22 }}>
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center' }}>Répartition des offres<HelpToggle id="planMix" open={openHelp} onToggle={toggleHelp} /></h3>
            {openHelp === 'planMix' && <div style={{ color: '#b79cff', fontSize: 12, lineHeight: 1.4, marginBottom: 10 }}>{SECTION_HELP.planMix}</div>}
            <table><thead><tr><th>Formule</th><th>Utilisateurs</th></tr></thead><tbody>
              {data.planMix.length ? data.planMix.map((row) => <tr key={row.plan}><td>{row.plan}</td><td>{row.count}</td></tr>) : <tr><td colSpan={2}>Aucune donnée.</td></tr>}
            </tbody></table>
          </div>

          <div className="card" style={{ marginTop: 22 }}>
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center' }}>Partages par type<HelpToggle id="shares" open={openHelp} onToggle={toggleHelp} /></h3>
            {openHelp === 'shares' && <div style={{ color: '#b79cff', fontSize: 12, lineHeight: 1.4, marginBottom: 10 }}>{SECTION_HELP.shares}</div>}
            <table><thead><tr><th>Canal</th><th>Partages</th></tr></thead><tbody>
              {data.sharesByChannel.length ? data.sharesByChannel.map((row) => <tr key={row.channel}><td>{shareChannelLabel(row.channel || '')}</td><td>{row.count}</td></tr>) : <tr><td colSpan={2}>Les compteurs démarrent avec la nouvelle version.</td></tr>}
            </tbody></table>
          </div>

          <div className="card" style={{ marginTop: 22 }}>
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center' }}>Utilisateurs par pays<HelpToggle id="countryMix" open={openHelp} onToggle={toggleHelp} /></h3>
            {openHelp === 'countryMix' && <div style={{ color: '#b79cff', fontSize: 12, lineHeight: 1.4, marginBottom: 10 }}>{SECTION_HELP.countryMix}</div>}
            <table><thead><tr><th>Pays</th><th>Utilisateurs</th></tr></thead><tbody>
              {data.countryMix.map((row) => <tr key={row.country}><td>{row.country === '--' ? 'Non renseigné' : row.country}</td><td>{row.count}</td></tr>)}
            </tbody></table>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
