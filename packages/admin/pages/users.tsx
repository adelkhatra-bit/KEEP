import React, { useMemo, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import DataModeBanner from '../components/DataModeBanner';
import { DEMO_USERS, DemoUser, PlanCode } from '../lib/demoData';
import { filterUsers } from '../lib/aggregate';
import { useLiveOrDemo } from '../lib/useLiveOrDemo';
import { adminApi, AdminApiError } from '../lib/apiClient';

const PLAN_OPTIONS: (PlanCode | 'ALL')[] = ['ALL', 'FREE', 'PREMIUM', 'CREATOR_PRO', 'VENUE_PRO'];
const GRANTABLE_PLANS: PlanCode[] = ['PREMIUM', 'CREATOR_PRO', 'VENUE_PRO'];
/** Mêmes icône/couleur que VerifiedBadge.tsx (mobile) -- jamais une palette
 * différente entre admin et l'app, sans quoi le Super Admin ne verrait pas
 * réellement ce que l'utilisateur va recevoir (cf. demande explicite du
 * 24/08/2026 : "regarder qui voient qu'est-ce qui vont avoir sur leur profil"). */
const BADGE_PREVIEW: Record<PlanCode, { icon: string; bg: string; label: string } | null> = {
  FREE: null,
  PREMIUM: { icon: '✓', bg: '#7C5CFC', label: 'Premium' },
  CREATOR_PRO: { icon: '★', bg: '#FFB454', label: 'Creator Pro' },
  VENUE_PRO: { icon: '◆', bg: '#2DE1C2', label: 'Venue Pro' },
};
const DURATIONS: { label: string; months: number | null }[] = [
  { label: '1 mois', months: 1 },
  { label: '3 mois', months: 3 },
  { label: '6 mois', months: 6 },
  { label: '1 an', months: 12 },
  { label: '2 ans', months: 24 },
  { label: 'Illimité', months: null },
];

interface RawProfile {
  id: string;
  username: string;
  country_code: string | null;
  created_at: string;
  subscriptions: { status: string; plans: { code: PlanCode } | null }[] | null;
}

function mapUsers(raw: RawProfile[]): DemoUser[] {
  return raw.map((p) => {
    const activePlan = p.subscriptions?.find((s) => s.status === 'ACTIVE')?.plans?.code;
    return {
      id: p.id,
      username: p.username,
      country: p.country_code ?? '—',
      plan: activePlan ?? 'FREE',
      // Aucune table "sessions"/"keeps" côté backend (voir docs/PROJECT_STATUS.md) --
      // pas de valeur inventée, -1 signale explicitement "non disponible" au rendu.
      keepsThisMonth: -1,
      joinedAt: p.created_at?.slice(0, 10) ?? '—',
    };
  });
}

/**
 * Écran Utilisateurs -- cf. RESTE_A_FAIRE.md Priorité 4. En Mode Réel, lit
 * `profiles` + `subscriptions` via GET /api/admin/users. Repli Mode Démo
 * honnête sinon.
 *
 * Offrir un plan (ajouté 24/08/2026 -- demande explicite : "si j'ai un ami
 * qui est Artiste je pourrais lui offrir pendant un an la formule full").
 * Réutilise POST /api/admin/grant (subscriptions/source=admin_grant, voir
 * migration 0014) -- jamais une deuxième logique parallèle. Désactivé en
 * Mode Démo (rien à écrire sans backend réel).
 */
export default function Users() {
  const usersResult = useLiveOrDemo('/users', mapUsers, DEMO_USERS);
  const [query, setQuery] = useState('');
  const [planFilter, setPlanFilter] = useState<PlanCode | 'ALL'>('ALL');
  const [grantingId, setGrantingId] = useState<string | null>(null);
  const [grantPlan, setGrantPlan] = useState<PlanCode>('CREATOR_PRO');
  const [grantMonths, setGrantMonths] = useState<number | null>(12);
  const [grantReason, setGrantReason] = useState('');
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantedNote, setGrantedNote] = useState<Record<string, string>>({});
  // Recherche par e-mail (cf. demande explicite du 24/08/2026 -- "tu dois
  // pouvoir rechercher : Adresse e-mail : artiste@email.com"). Séparée de la
  // recherche pseudo/pays ci-dessus (client-side sur la page déjà chargée) --
  // celle-ci interroge le backend en direct (GET /admin/users/search,
  // migration 0023) car l'email n'existe pas dans `profiles`. Réutilise
  // EXACTEMENT le même openGrant/confirmGrant que la liste principale --
  // jamais une deuxième logique d'attribution de plan.
  const [emailQuery, setEmailQuery] = useState('');
  const [emailResults, setEmailResults] = useState<{ id: string; username: string | null; email: string; display_name: string | null }[] | null>(null);
  const [emailSearchBusy, setEmailSearchBusy] = useState(false);
  const [emailSearchError, setEmailSearchError] = useState<string | null>(null);
  const searchByEmail = async () => {
    const q = emailQuery.trim();
    if (!q) return;
    setEmailSearchBusy(true);
    setEmailSearchError(null);
    try {
      const res = await adminApi.get<{ data: typeof emailResults }>(`/users/search?q=${encodeURIComponent(q)}`);
      setEmailResults(res.data ?? []);
    } catch (e) {
      setEmailSearchError(e instanceof AdminApiError ? `${e.message} (HTTP ${e.status})` : 'Échec de la recherche.');
    } finally {
      setEmailSearchBusy(false);
    }
  };

  const filtered = useMemo(
    () => filterUsers(usersResult.data, query, planFilter),
    [usersResult.data, query, planFilter]
  );

  const openGrant = (userId: string) => {
    setGrantingId(userId);
    setGrantPlan('CREATOR_PRO');
    setGrantMonths(12);
    setGrantReason('');
    setGrantError(null);
  };

  const confirmGrant = async (userId: string) => {
    setGrantBusy(true);
    setGrantError(null);
    try {
      await adminApi.post('/grant', {
        targetProfileId: userId,
        planCode: grantPlan,
        durationMonths: grantMonths,
        reason: grantReason || null,
      });
      const durationLabel = DURATIONS.find((d) => d.months === grantMonths)?.label ?? '';
      setGrantedNote((n) => ({ ...n, [userId]: `${grantPlan} offert (${durationLabel}) à ${new Date().toLocaleTimeString('fr-FR')}` }));
      setGrantingId(null);
      usersResult.refresh();
    } catch (e) {
      setGrantError(e instanceof AdminApiError ? `${e.message} (HTTP ${e.status})` : 'Échec de l\'offre d\'accès.');
    } finally {
      setGrantBusy(false);
    }
  };

  return (
    <AdminLayout>
      <div className="page-title">Utilisateurs</div>
      <div className="page-subtitle">{filtered.length} / {usersResult.data.length} utilisateur(s) — France (EUR)</div>

      <DataModeBanner
        mode={usersResult.mode}
        loading={usersResult.loading}
        reason={usersResult.reason}
        demoNote={`${DEMO_USERS.length} utilisateurs d'exemple.`}
      />

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <input
          type="text"
          placeholder="Rechercher (pseudo, pays)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: 1,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 13,
          }}
        />
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value as PlanCode | 'ALL')}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 13,
          }}
        >
          {PLAN_OPTIONS.map((p) => (
            <option key={p} value={p}>{p === 'ALL' ? 'Tous les plans' : p}</option>
          ))}
        </select>
      </div>

      {usersResult.mode === 'live' && (
        <div style={{ marginBottom: 24, padding: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Rechercher un compte par e-mail</div>
          <div style={{ display: 'flex', gap: 12 }}>
            <input
              type="text"
              placeholder="artiste@email.com"
              value={emailQuery}
              onChange={(e) => setEmailQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchByEmail()}
              style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '8px 12px', fontSize: 13 }}
            />
            <button
              onClick={searchByEmail}
              disabled={emailSearchBusy || !emailQuery.trim()}
              style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}
            >
              {emailSearchBusy ? '…' : 'Rechercher'}
            </button>
          </div>
          {emailSearchError && <div style={{ color: 'var(--danger, #e05252)', fontSize: 12, marginTop: 8 }}>{emailSearchError}</div>}
          {emailResults && emailResults.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>Aucun compte ne correspond à cet e-mail.</div>
          )}
          {emailResults && emailResults.map((u) => (
            <div key={u.id} style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13 }}>
                  <strong>{u.username ?? u.display_name ?? '(profil pas encore créé)'}</strong> — {u.email}
                </span>
                <button
                  onClick={() => (grantingId === u.id ? setGrantingId(null) : openGrant(u.id))}
                  style={{
                    background: 'var(--bg)', color: 'var(--primary)', border: '1px solid var(--primary)',
                    borderRadius: 8, padding: '6px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 12,
                  }}
                >
                  🎁 Offrir un plan
                </button>
                {grantedNote[u.id] && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{grantedNote[u.id]}</span>}
              </div>
              {grantingId === u.id && (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
                  <select value={grantPlan} onChange={(e) => setGrantPlan(e.target.value as PlanCode)}
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '6px 10px' }}>
                    {GRANTABLE_PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <select value={grantMonths === null ? 'unlimited' : String(grantMonths)}
                    onChange={(e) => setGrantMonths(e.target.value === 'unlimited' ? null : parseInt(e.target.value, 10))}
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '6px 10px' }}>
                    {DURATIONS.map((d) => <option key={d.label} value={d.months === null ? 'unlimited' : d.months}>{d.label}</option>)}
                  </select>
                  <input
                    type="text"
                    placeholder="Raison (facultatif)"
                    value={grantReason}
                    onChange={(e) => setGrantReason(e.target.value)}
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '6px 10px', flex: 1, minWidth: 160 }}
                  />
                  <button
                    onClick={() => confirmGrant(u.id)}
                    disabled={grantBusy}
                    style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    {grantBusy ? '…' : 'Confirmer'}
                  </button>
                  <button onClick={() => setGrantingId(null)} style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
                    Annuler
                  </button>
                </div>
              )}
              {grantError && grantingId === u.id && <div style={{ color: 'var(--danger, #e05252)', fontSize: 12, marginTop: 6 }}>{grantError}</div>}
            </div>
          ))}
        </div>
      )}

      <table>
        <thead>
          <tr><th>Utilisateur</th><th>Pays</th><th>Plan</th><th>GARDER ce mois</th><th>Inscrit le</th><th /></tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr><td colSpan={6} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>Aucun utilisateur ne correspond à ces critères.</td></tr>
          )}
          {filtered.map((u) => (
            <React.Fragment key={u.id}>
              <tr>
                <td>{u.username}</td>
                <td>{u.country}</td>
                <td>{u.plan}</td>
                <td>{u.keepsThisMonth === -1 ? '— (non suivi côté backend)' : u.keepsThisMonth}</td>
                <td>{u.joinedAt}</td>
                <td>
                  {usersResult.mode === 'live' && (
                    <button
                      onClick={() => (grantingId === u.id ? setGrantingId(null) : openGrant(u.id))}
                      style={{
                        background: 'var(--bg-card)', color: 'var(--primary)', border: '1px solid var(--primary)',
                        borderRadius: 8, padding: '6px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 12,
                      }}
                    >
                      🎁 Offrir un plan
                    </button>
                  )}
                  {grantedNote[u.id] && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{grantedNote[u.id]}</div>}
                </td>
              </tr>
              {grantingId === u.id && (
                <tr>
                  <td colSpan={6} style={{ background: 'var(--bg-card)', padding: 16 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>Offrir à {u.username} :</span>
                      <select value={grantPlan} onChange={(e) => setGrantPlan(e.target.value as PlanCode)}
                        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '6px 10px' }}>
                        {GRANTABLE_PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                      {BADGE_PREVIEW[grantPlan] && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                          recevra
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 20, height: 20, borderRadius: 999, background: BADGE_PREVIEW[grantPlan]!.bg,
                            color: '#000', fontSize: 11, fontWeight: 900,
                          }}>{BADGE_PREVIEW[grantPlan]!.icon}</span>
                          {BADGE_PREVIEW[grantPlan]!.label}
                        </span>
                      )}
                      <select value={grantMonths === null ? 'unlimited' : String(grantMonths)}
                        onChange={(e) => setGrantMonths(e.target.value === 'unlimited' ? null : parseInt(e.target.value, 10))}
                        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '6px 10px' }}>
                        {DURATIONS.map((d) => <option key={d.label} value={d.months === null ? 'unlimited' : d.months}>{d.label}</option>)}
                      </select>
                      <input
                        type="text"
                        placeholder="Raison (facultatif)"
                        value={grantReason}
                        onChange={(e) => setGrantReason(e.target.value)}
                        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '6px 10px', flex: 1, minWidth: 160 }}
                      />
                      <button
                        onClick={() => confirmGrant(u.id)}
                        disabled={grantBusy}
                        style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        {grantBusy ? '…' : 'Confirmer'}
                      </button>
                      <button
                        onClick={() => setGrantingId(null)}
                        style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}
                      >
                        Annuler
                      </button>
                    </div>
                    {grantError && <p style={{ color: 'var(--danger, #ff5c5c)', marginTop: 8, fontSize: 12 }}>{grantError}</p>}
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </AdminLayout>
  );
}
