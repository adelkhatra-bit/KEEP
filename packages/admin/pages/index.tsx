import React, { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import Hint from '../components/Hint';
import { PeriodButtons } from '../components/PresetPicker';
import { supabase } from '../lib/supabaseClient';
import { invokeAdminFunction } from '../lib/invokeFunction';
import { Bars, LineChart } from '../components/MiniChart';

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
  activeOffered?: number;
  testAccounts?: number;
  keeps: number;
  follows: number;
  shares: number;
  eventsCreated: number;
  dailySignups: DailyRow[];
  planMix: CountRow[];
  sharesByChannel: CountRow[];
  countryMix: CountRow[];
};

type Side = { total: number; new: number; verified: number; active: number };
// admin_dashboard_v2 (comptabilités séparées). Absente tant que la migration n'est pas appliquée → l'Accueil garde la v1.
type DashboardV2 = {
  people: { real: Side; test: Side };
  money: { byCurrency: Array<{ currency: string; gross: number; refunds: number; net: number; count: number }>; paidSubscribers: number; freePacksBought: { count: number; free: number }; marketByCurrency: Array<{ currency: string; cents: number; count: number }> };
  offered: { subscriptions: number; subscriptionsReal: number; adminFree: { real: number; test: number }; monthlyFree: { real: number; test: number } };
  freeEconomy: { earnedByType: Record<string, number>; soloPacksFree: number; marketFree: number };
  shares: { real: number; test: number; anonymous: number; byChannel: CountRow[]; sharers: number };
  daily: Array<{ date: string; signupsReal: number; signupsTest: number; sharesReal: number; revenueCents: number }>;
};
const EARN_LABELS: Record<string, string> = { LISTEN_STREAK_DAILY: 'Série du jour', LISTEN_STREAK_DAY7: 'Série 7 j', FIRST_DISCOVERY_KEEP: 'Découvreur', REFERRAL: 'Parrainage', BATTLE_SOLO: 'Battle solo', BATTLE_ONLINE: 'Battle en ligne' };
const money = (v: number, currency: string) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(v);

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

const invokeUserControl = (body: Record<string, unknown>) => invokeAdminFunction('keep-admin-user-control', body);

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
  const [v2, setV2] = useState<DashboardV2 | null>(null);
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
      const second = await supabase.rpc('admin_dashboard_v2', { p_from: from, p_to: to, p_country: country || null });
      setV2(second.error || !(second.data as DashboardV2 | null)?.people ? null : (second.data as DashboardV2));
    } catch (e: any) {
      setError(e?.message ?? 'Impossible de charger les statistiques réelles.');
    } finally {
      setLoading(false);
    }
  };

  // Zéro clic inutile (07/10/2026) : la période ou le pays choisi se recharge tout seul.
  useEffect(() => { void load(); }, [from, to, country]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AdminLayout>
      <div className="page-title">Accueil <Hint title="Accueil" text={<>Statistiques réelles Loki Music — filtres par période et pays</>}/></div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
          <PeriodButtons from={from} to={to} onPick={(r) => { setFrom(r.from); setTo(r.to); }} />
          <details><summary style={{ cursor: 'pointer', color: '#b79cff', fontWeight: 800 }}>📅 Autre période</summary>
            <label>Du<br /><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>Au<br /><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </details>
          <label>Pays<br />
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">Tous les pays</option>
              {countries.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
            </select>
          </label>
          {loading ? <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Chargement…</span> : null}
        </div>
      </div>

      {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
      {!error && data && <div className="demo-banner"><span className="real-pill">● Réel <Hint title="Mode réel" text="Données lues directement depuis Supabase. Les partages sont comptés par type à partir de cette version."/></span></div>}

      {data && (
        <>
          {/* 07/10/2026 (Adel) : comptabilités SÉPARÉES, un bloc par monde, côte à côte. Réels ≠ tests, argent ≠ offert. */}
          <div className="plan-cards">
            <section className="plan-card">
              <header className="plan-card-head">👥 Réels<Hint title="Utilisateurs réels" text="Vrais utilisateurs. Les comptes de test (masqués) ne sont JAMAIS comptés ici."/></header>
              <div className="stat"><b>{v2 ? v2.people.real.total : data.usersTotal}</b><span>comptes</span></div>
              <div className="stat"><b>{v2 ? v2.people.real.new : data.newUsers}</b><span>nouveaux</span></div>
              <div className="stat"><b>{v2 ? v2.people.real.verified : data.verifiedEmails}</b><span>e-mails vérifiés</span></div>
              {v2 && <div className="stat"><b>{v2.people.real.active}</b><span>actifs</span></div>}
            </section>
            <section className="plan-card">
              <header className="plan-card-head">🧪 Tests<Hint title="Comptes de test" text="Comptes créés pour tester (masqués des Découvertes). Toujours séparés des vrais chiffres."/></header>
              <div className="stat"><b>{v2 ? v2.people.test.total : (data.testAccounts ?? '—')}</b><span>comptes</span></div>
              {v2 && <div className="stat"><b>{v2.people.test.new}</b><span>nouveaux</span></div>}
              {v2 && <div className="stat"><b>{v2.shares.test}</b><span>partages</span></div>}
            </section>
            <section className="plan-card plan-card-paid">
              <header className="plan-card-head">💶 Argent<Hint title="Argent réel" text="Uniquement l’argent réellement payé par de vrais utilisateurs, devise par devise (jamais additionnées). Les abonnements offerts n’y sont jamais."/></header>
              <div className="stat"><b>{v2 ? v2.money.paidSubscribers : data.activePaid}</b><span>abonnés payants</span></div>
              {v2 && (v2.money.byCurrency.length ? v2.money.byCurrency.map((m) => <div key={m.currency} className="stat"><b>{money(m.net, m.currency)}</b><span>net {m.currency} · {m.count} paiement(s)</span></div>) : <div className="stat"><b>0 €</b><span>encaissé</span></div>)}
              {v2 && <div className="stat"><b>{v2.money.freePacksBought.count}</b><span>packs FREE achetés</span></div>}
              {v2 && v2.money.marketByCurrency.map((m) => <div key={m.currency} className="stat"><b>{money(m.cents / 100, m.currency)}</b><span>ventes marketplace</span></div>)}
            </section>
            <section className="plan-card">
              <header className="plan-card-head">🎁 Offert<Hint title="Offert par Loki" text="Ce que Loki donne sans paiement : abonnements offerts et FREE donnés. Jamais compté comme de l’argent."/></header>
              <div className="stat"><b>{v2 ? v2.offered.subscriptions : (data.activeOffered ?? 0)}</b><span>abonnements offerts</span></div>
              {v2 && <div className="stat"><b>{v2.offered.adminFree.real}</b><span>FREE donnés (réels)</span></div>}
              {v2 && <div className="stat"><b>{v2.offered.monthlyFree.real}</b><span>FREE mensuels (réels)</span></div>}
              {v2 && <div className="stat muted"><b>{v2.offered.adminFree.test + v2.offered.monthlyFree.test}</b><span>FREE vers tests</span></div>}
            </section>
            {v2 && <section className="plan-card">
              <header className="plan-card-head">🎮 FREE<Hint title="FREE gagnés et dépensés" text="FREE gagnés en jouant (séries, découvreur, Battle…) et dépensés (packs Solo, marketplace), par les vrais utilisateurs. Négatif = perdu."/></header>
              {Object.entries(v2.freeEconomy.earnedByType).map(([k, v]) => <div key={k} className="stat"><b>{v > 0 ? `+${v}` : v}</b><span>{EARN_LABELS[k] ?? k.toLowerCase().replace(/_/g, ' ')}</span></div>)}
              <div className="stat"><b>−{v2.freeEconomy.soloPacksFree}</b><span>packs Solo</span></div>
              <div className="stat"><b>{v2.freeEconomy.marketFree}</b><span>échangés marketplace</span></div>
            </section>}
          </div>

          <div className="card" style={{ marginTop: 22 }}>
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center' }}>Courbes<Hint title="Courbes" text="Jour par jour sur la période choisie. Les vrais utilisateurs et les tests sont des courbes séparées."/></h3>
            {v2 ? <LineChart dates={v2.daily.map((d) => d.date)} series={[
              { label: 'Inscriptions réelles', color: '#a78bfa', values: v2.daily.map((d) => d.signupsReal) },
              { label: 'Inscriptions tests', color: '#8f88a8', values: v2.daily.map((d) => d.signupsTest) },
              { label: 'Partages réels', color: '#34d399', values: v2.daily.map((d) => d.sharesReal) },
            ]} /> : <LineChart dates={data.dailySignups.map((d) => d.date)} series={[{ label: 'Inscriptions', color: '#a78bfa', values: data.dailySignups.map((d) => d.count) }]} />}
          </div>

          <div className="plan-cards" style={{ marginTop: 22 }}>
            <section className="plan-card" style={{ flexBasis: 360, maxWidth: 'none' }}>
              <header className="plan-card-head">📤 Partages<Hint title="Partages" text="Partages faits par les vrais utilisateurs, par type. Partager ne coûte rien et ne rapporte pas de FREE (les paliers donnent des Découvertes et des Vibes)."/></header>
              <div className="stat"><b>{v2 ? v2.shares.real : data.shares}</b><span>partages réels</span></div>
              {v2 && <div className="stat"><b>{v2.shares.sharers}</b><span>personnes qui partagent</span></div>}
              <Bars rows={(v2 ? v2.shares.byChannel : data.sharesByChannel).map((r) => ({ label: shareChannelLabel(r.channel || ''), value: r.count }))} color="#34d399" empty="Aucun partage sur la période." />
            </section>
            <section className="plan-card" style={{ flexBasis: 300, maxWidth: 'none' }}>
              <header className="plan-card-head">🧾 Formules<Hint title="Formules" text="Comptes par formule à l’instant présent. « (offert) » = abonnement offert, jamais payé."/></header>
              <Bars rows={data.planMix.map((r) => ({ label: String(r.plan), value: r.count }))} />
            </section>
            <section className="plan-card" style={{ flexBasis: 260, maxWidth: 'none' }}>
              <header className="plan-card-head">🌍 Pays<Hint title="Pays" text="Comptes réels par pays. « Non renseigné » = aucun pays choisi ou détecté."/></header>
              <Bars rows={data.countryMix.map((r) => ({ label: r.country === '--' ? 'Non renseigné' : String(r.country), value: r.count }))} color="#60a5fa" />
            </section>
          </div>

          <div className="card" style={{ marginTop: 22 }}>
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center' }}>Inscriptions<Hint title="Inscriptions" text="Touche un jour pour voir les comptes créés ce jour-là (et supprimer un compte de test)."/></h3>
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
        </>
      )}
    </AdminLayout>
  );
}
