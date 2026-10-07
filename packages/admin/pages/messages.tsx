import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import Hint from '../components/Hint';
import { supabase } from '../lib/supabaseClient';
import { invokeAdminFunction } from '../lib/invokeFunction';

// Super Admin zéro clavier (Adel, 07/10/2026) : messages prêts. Un choix remplit le titre ET le texte ; on peut encore retoucher.
const MESSAGE_TEMPLATES: ReadonlyArray<{ key: string; label: string; title: string; body: string }> = [
  { key: 'update', label: '🚀 Mise à jour', title: 'Nouvelle version de Loki Music', body: 'Une nouvelle version est disponible. Mets à jour l’app pour profiter des dernières nouveautés.' },
  { key: 'free', label: '🎁 FREE offerts', title: 'Cadeau : des FREE pour toi', body: 'Loki Music t’offre des FREE. Ils sont déjà sur ton compte, profites-en !' },
  { key: 'pulse', label: '🎧 Nouveautés Pulse', title: 'Nouvelles musiques dans Loki Pulse', body: 'De nouveaux titres dans tes styles t’attendent dans Loki Pulse.' },
  { key: 'battle', label: '⚡ Battle', title: 'Une Battle t’attend', body: 'Défie tes amis sur Loki Music et gagne des FREE.' },
  { key: 'story', label: '⭕ Story', title: 'Partage ta musique en story', body: 'Garde un morceau en public : il apparaît dans ta story pendant 24 h.' },
  { key: 'maintenance', label: '🛠 Maintenance', title: 'Maintenance en cours', body: 'Loki Music est en maintenance quelques minutes. Merci pour ta patience.' },
  { key: 'bug', label: '✅ Bug corrigé', title: 'Problème corrigé', body: 'Le problème que tu as signalé est corrigé. Merci de nous aider à améliorer Loki Music !' },
];


type DirectoryUser = { id: string; username: string; display_name: string | null };
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
      <div className="page-title">Messages <Hint title="Messages" text={<>Envoyer une notification Loki Music à tous les utilisateurs ou à une sélection — apparaît dans l'app et en push, comme n'importe quelle autre notification.</>}/></div>

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

      <div className="card" style={{ marginBottom: 16, borderColor: 'var(--primary)' }}>
        <strong>Accès aux notifications</strong>
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 5 }}>
          Les cadenas et les formules sont gérés dans la rubrique dédiée « Accès notifications » du menu Super Admin.
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Message</h3>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {MESSAGE_TEMPLATES.map((t) => (
            <button key={t.key} type="button" className="btn" onClick={() => { setTitle(t.title); setBody(t.body); }}
              aria-pressed={title === t.title} style={{ background: title === t.title ? 'var(--primary)' : undefined, color: title === t.title ? '#fff' : undefined }}>{t.label}</button>
          ))}
        </div>
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
