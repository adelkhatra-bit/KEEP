import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';
import { invokeAdminFunction } from '../lib/invokeFunction';

type DirectoryUser = { id: string; username: string; display_name: string | null };
type NotificationPlanCode = 'FREE' | 'PREMIUM' | 'CREATOR_PRO' | 'VENUE_PRO';
type NotificationAccessRule = { notification_type: string; is_locked: boolean; min_plan_code: NotificationPlanCode };

const NOTIFICATION_PLAN_OPTIONS: Array<{ code: NotificationPlanCode; label: string }> = [
  { code: 'FREE', label: 'Free / tous' },
  { code: 'PREMIUM', label: 'Premium' },
  { code: 'CREATOR_PRO', label: 'Creator Pro' },
  { code: 'VENUE_PRO', label: 'Venue Pro' },
];

const invokeAdmin = (body: Record<string, unknown>) => invokeAdminFunction('keep-admin-control', body);

export default function Messages() {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<'ALL' | 'SELECTED'>('ALL');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [notificationRules, setNotificationRules] = useState<NotificationAccessRule[]>([]);
  const [notificationRulesLoading, setNotificationRulesLoading] = useState(true);
  const [notificationRuleBusy, setNotificationRuleBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!supabase) { setLoading(false); return; }
      try {
        const { data, error: rpcError } = await supabase.rpc('admin_user_directory');
        if (rpcError) throw rpcError;
        setUsers(((data ?? []) as any[]).map((row) => ({ id: row.id, username: row.username, display_name: row.display_name })));
      } catch (e: any) {
        setError(e?.message ?? 'Impossible de charger la liste des utilisateurs.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    let live = true;
    if (!supabase) { setNotificationRulesLoading(false); return () => { live = false; }; }
    void supabase
      .from('notification_access_rules')
      .select('notification_type,is_locked,min_plan_code')
      .order('notification_type', { ascending: true })
      .then(({ data, error: rulesError }) => {
        if (!live) return;
        if (rulesError) setError(rulesError.message);
        else setNotificationRules((data ?? []) as NotificationAccessRule[]);
        setNotificationRulesLoading(false);
      });
    return () => { live = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.username.toLowerCase().includes(q) || (u.display_name ?? '').toLowerCase().includes(q));
  }, [users, query]);

  const toggle = (username: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username); else next.add(username);
      return next;
    });
  };

  const saveNotificationRule = async (rule: NotificationAccessRule, patch: Partial<NotificationAccessRule>) => {
    if (!supabase) return;
    const next: NotificationAccessRule = { ...rule, ...patch };
    setNotificationRules((current) => current.map((item) => item.notification_type === rule.notification_type ? next : item));
    setNotificationRuleBusy(rule.notification_type);
    setError(null);
    try {
      const { error: saveError } = await supabase
        .from('notification_access_rules')
        .upsert({
          notification_type: next.notification_type,
          is_locked: next.is_locked,
          min_plan_code: next.is_locked ? next.min_plan_code : 'FREE',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'notification_type' });
      if (saveError) throw saveError;
      setMessage(`Règle ${next.notification_type} enregistrée.`);
    } catch (e: any) {
      setError(e?.message ?? 'Impossible d’enregistrer le cadenas.');
    } finally {
      setNotificationRuleBusy(null);
    }
  };

  const send = async () => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const usernames = target === 'SELECTED' ? Array.from(selected) : [];
      if (target === 'SELECTED' && !usernames.length) throw new Error('Choisis au moins un utilisateur.');
      const result = await invokeAdmin({ action: 'notifications.broadcast', title: title.trim(), body: body.trim(), usernames });
      setMessage(`Message envoyé à ${result.recipientCount} utilisateur${result.recipientCount > 1 ? 's' : ''}.`);
      setTitle(''); setBody(''); setSelected(new Set());
    } catch (e: any) {
      setError(e?.message ?? 'Envoi impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminLayout>
      <div className="page-title">Messages</div>
      <div className="page-subtitle">Envoyer une notification Loki Music à tous les utilisateurs ou à une sélection — apparaît dans l'app et en push, comme n'importe quelle autre notification.</div>

      {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
      {message && <div className="demo-banner" style={{ borderColor: '#2e7d32' }}>{message}</div>}

      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ marginTop: 0 }}>Destinataires</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button onClick={() => setTarget('ALL')} style={{ opacity: target === 'ALL' ? 1 : .55 }}>Tous les utilisateurs ({users.length})</button>
          <button onClick={() => setTarget('SELECTED')} style={{ opacity: target === 'SELECTED' ? 1 : .55 }}>Choisir individuellement</button>
        </div>

        {target === 'SELECTED' && (
          <div>
            <input
              type="text"
              placeholder="Rechercher un pseudo…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}
            />
            {loading ? <p style={{ color: 'var(--text-muted)' }}>Chargement…</p> : (
              <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10, padding: 8 }}>
                {filtered.length === 0 ? <p style={{ color: 'var(--text-muted)', margin: 6 }}>Aucun résultat.</p> : filtered.map((u) => (
                  <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selected.has(u.username)} onChange={() => toggle(u.username)} />
                    <span>@{u.username}</span>
                    {u.display_name && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>· {u.display_name}</span>}
                  </label>
                ))}
              </div>
            )}
            {selected.size > 0 && <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 12 }}>{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</div>}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ marginTop: 0 }}>Cadenas des notifications</h3>
        <p style={{ color: 'var(--text-muted)', marginTop: -4 }}>
          Chaque type de notification peut rester visible mais verrouillé. Son contenu est alors masqué et l’utilisateur voit la formule nécessaire pour le débloquer.
        </p>
        {notificationRulesLoading ? <p style={{ color: 'var(--text-muted)' }}>Chargement des types réels…</p> : (
          <div style={{ display: 'grid', gap: 8 }}>
            {notificationRules.map((rule) => (
              <div key={rule.notification_type} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1fr) 110px minmax(150px,190px)', gap: 10, alignItems: 'center', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 10px' }}>
                <div>
                  <strong style={{ fontSize: 13 }}>{rule.notification_type.replace(/_/g, ' ')}</strong>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>{rule.is_locked ? `🔒 Réservée à partir de ${rule.min_plan_code}` : '🔓 Visible pour tous'}</div>
                </div>
                <button
                  type="button"
                  disabled={notificationRuleBusy === rule.notification_type}
                  onClick={() => void saveNotificationRule(rule, { is_locked: !rule.is_locked, min_plan_code: !rule.is_locked && rule.min_plan_code === 'FREE' ? 'PREMIUM' : rule.min_plan_code })}
                  style={{ background: rule.is_locked ? '#3D2860' : 'transparent', border: '1px solid var(--primary)', color: '#fff' }}
                >
                  {rule.is_locked ? '🔒 Verrouillé' : '🔓 Ouvert'}
                </button>
                <select
                  value={rule.min_plan_code}
                  disabled={!rule.is_locked || notificationRuleBusy === rule.notification_type}
                  onChange={(e) => void saveNotificationRule(rule, { min_plan_code: e.target.value as NotificationPlanCode })}
                  style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 10px' }}
                >
                  {NOTIFICATION_PLAN_OPTIONS.filter((option) => option.code !== 'FREE' || !rule.is_locked).map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Message</h3>
        <input
          type="text"
          placeholder="Titre (ex: Mise à jour Loki Music)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={140}
          spellCheck
          lang="fr"
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}
        />
        <textarea
          placeholder="Contenu du message…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={5}
          spellCheck
          lang="fr"
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 14px', resize: 'vertical' }}
        />
        <button
          onClick={() => void send()}
          disabled={busy || !title.trim() || !body.trim() || (target === 'SELECTED' && selected.size === 0)}
          style={{ marginTop: 12, background: 'var(--primary)' }}
        >
          {busy ? 'Envoi…' : target === 'ALL' ? `Envoyer à tous (${users.length})` : `Envoyer à la sélection (${selected.size})`}
        </button>
      </div>
    </AdminLayout>
  );
}
