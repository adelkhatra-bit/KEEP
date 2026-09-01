import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';

type DirectoryUser = { id: string; username: string; display_name: string | null };

async function invokeAdmin(body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase Super Admin non configuré.');
  const { data, error } = await supabase.functions.invoke('keep-admin-control', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.message || data.error);
  return data;
}

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
      <div className="page-subtitle">Envoyer une notification Loki à tous les utilisateurs ou à une sélection — apparaît dans l'app et en push, comme n'importe quelle autre notification.</div>

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

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Message</h3>
        <input
          type="text"
          placeholder="Titre (ex: Mise à jour Loki)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={140}
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}
        />
        <textarea
          placeholder="Contenu du message…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={5}
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
