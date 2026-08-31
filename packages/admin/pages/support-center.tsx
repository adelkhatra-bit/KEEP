import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';

type Ticket = {
  id: string;
  profile_id: string;
  category: string;
  subject: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_USER' | 'RESOLVED' | 'CLOSED';
  priority: string;
  app_context: Record<string, unknown>;
  created_at: string;
  last_message_at: string;
  profile?: { username?: string; avatar_url?: string | null } | null;
};

type Message = {
  id: string;
  ticket_id: string;
  sender_role: 'USER' | 'ADMIN' | 'SYSTEM';
  body: string;
  created_at: string;
};

const STATUS_LABEL: Record<Ticket['status'], string> = {
  OPEN: 'Ouvert', IN_PROGRESS: 'En cours', WAITING_USER: 'Attente utilisateur', RESOLVED: 'Résolu', CLOSED: 'Fermé',
};

export default function SupportCenterAdmin() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState('');
  const [filter, setFilter] = useState<'ACTIVE' | 'ALL'>('ACTIVE');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadTickets = useCallback(async () => {
    if (!supabase) return;
    let query = supabase
      .from('support_tickets')
      .select('id,profile_id,category,subject,status,priority,app_context,created_at,last_message_at,profile:profiles!support_tickets_profile_id_fkey(username,avatar_url)')
      .order('last_message_at', { ascending: false });
    if (filter === 'ACTIVE') query = query.in('status', ['OPEN', 'IN_PROGRESS', 'WAITING_USER']);
    const { data, error: queryError } = await query;
    if (queryError) throw queryError;
    setTickets((data ?? []) as unknown as Ticket[]);
  }, [filter]);

  const loadMessages = useCallback(async (ticketId: string | null) => {
    if (!supabase || !ticketId) { setMessages([]); return; }
    const { data, error: queryError } = await supabase
      .from('support_ticket_messages')
      .select('id,ticket_id,sender_role,body,created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
    if (queryError) throw queryError;
    setMessages((data ?? []) as Message[]);
  }, []);

  const refresh = useCallback(async () => {
    setError('');
    try {
      await loadTickets();
      if (selectedId) await loadMessages(selectedId);
    } catch (e: any) { setError(e?.message || 'Impossible de charger le support.'); }
  }, [loadMessages, loadTickets, selectedId]);

  useEffect(() => {
    setLoading(true);
    void refresh().finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { void loadMessages(selectedId); }, [loadMessages, selectedId]);

  useEffect(() => {
    const client = supabase;
    if (!client) return undefined;
    const channel = client.channel('admin-support-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => { void refresh(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_ticket_messages' }, () => { void refresh(); })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [refresh]);

  const selected = useMemo(() => tickets.find((ticket) => ticket.id === selectedId) ?? null, [selectedId, tickets]);

  const setStatus = async (status: Ticket['status']) => {
    if (!supabase || !selected) return;
    setBusy(true);
    try {
      const { error: updateError } = await supabase.from('support_tickets').update({ status, updated_at: new Date().toISOString() }).eq('id', selected.id);
      if (updateError) throw updateError;
      await refresh();
    } catch (e: any) { setError(e?.message || 'Impossible de modifier le ticket.'); }
    finally { setBusy(false); }
  };

  const sendReply = async () => {
    if (!supabase || !selected || !reply.trim()) return;
    setBusy(true);
    try {
      const { error: insertError } = await supabase.from('support_ticket_messages').insert({
        ticket_id: selected.id,
        sender_profile_id: null,
        sender_role: 'ADMIN',
        body: reply.trim(),
        metadata: { source: 'super_admin' },
      });
      if (insertError) throw insertError;
      setReply('');
      await refresh();
    } catch (e: any) { setError(e?.message || 'Impossible d’envoyer la réponse.'); }
    finally { setBusy(false); }
  };

  return <AdminLayout>
    <div className="page-title">Support utilisateurs</div>
    <div className="page-subtitle">Conversation directe Loki ↔ utilisateurs · données Supabase réelles</div>
    <div className="demo-banner">● MODE RÉEL — les demandes viennent de l’application et les réponses repartent dans Réglages avancés.</div>

    <div style={{ display:'flex', gap:8, margin:'14px 0' }}>
      <button onClick={() => setFilter('ACTIVE')} style={{ opacity: filter === 'ACTIVE' ? 1 : .55 }}>Actifs</button>
      <button onClick={() => setFilter('ALL')} style={{ opacity: filter === 'ALL' ? 1 : .55 }}>Tous</button>
      <button onClick={() => void refresh()} disabled={loading}>{loading ? 'Chargement…' : 'Actualiser'}</button>
    </div>
    {error ? <div className="demo-banner" style={{ borderColor:'#b42318' }}>Erreur : {error}</div> : null}

    <div style={{ display:'grid', gridTemplateColumns:'minmax(280px, 38%) minmax(0, 1fr)', gap:16, alignItems:'start' }}>
      <div className="card" style={{ padding:10 }}>
        {!tickets.length ? <p style={{ color:'var(--text-muted)' }}>Aucune demande dans ce filtre.</p> : tickets.map((ticket) => <button key={ticket.id} onClick={() => setSelectedId(ticket.id)} style={{ width:'100%', textAlign:'left', marginBottom:8, padding:12, borderRadius:12, border: selectedId === ticket.id ? '1px solid #a78bfa' : '1px solid #332943', background:'#100c18', color:'#fff', cursor:'pointer' }}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}><strong>@{ticket.profile?.username || ticket.profile_id.slice(0,8)}</strong><span style={{ color:'#a78bfa', fontSize:11 }}>{STATUS_LABEL[ticket.status]}</span></div>
          <div style={{ marginTop:5, fontWeight:800 }}>{ticket.subject}</div>
          <div style={{ marginTop:5, color:'#958ba6', fontSize:11 }}>{ticket.category} · {new Date(ticket.last_message_at).toLocaleString('fr-FR')}</div>
        </button>)}
      </div>

      <div className="card">
        {!selected ? <p style={{ color:'var(--text-muted)' }}>Sélectionne une demande.</p> : <>
          <div style={{ display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
            <div><h2 style={{ margin:'0 0 4px' }}>{selected.subject}</h2><div style={{ color:'#a79db5', fontSize:12 }}>@{selected.profile?.username || selected.profile_id} · {selected.category} · priorité {selected.priority}</div></div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              <button disabled={busy} onClick={() => void setStatus('IN_PROGRESS')}>En cours</button>
              <button disabled={busy} onClick={() => void setStatus('RESOLVED')}>Résolu</button>
              <button disabled={busy} onClick={() => void setStatus('CLOSED')}>Fermer</button>
            </div>
          </div>
          <details style={{ marginTop:12 }}><summary>Contexte technique</summary><pre style={{ whiteSpace:'pre-wrap', fontSize:11, color:'#a79db5' }}>{JSON.stringify(selected.app_context || {}, null, 2)}</pre></details>
          <div style={{ marginTop:16, display:'grid', gap:8 }}>
            {messages.map((message) => <div key={message.id} style={{ maxWidth:'88%', justifySelf: message.sender_role === 'ADMIN' ? 'end' : 'start', padding:'10px 12px', borderRadius:12, background: message.sender_role === 'ADMIN' ? '#28184a' : '#120e1b', border:'1px solid #3a2d50' }}>
              <div style={{ color:'#a78bfa', fontSize:10, fontWeight:900 }}>{message.sender_role === 'ADMIN' ? 'Loki' : message.sender_role === 'SYSTEM' ? 'SYSTÈME' : 'UTILISATEUR'}</div>
              <div style={{ marginTop:4, whiteSpace:'pre-wrap' }}>{message.body}</div>
              <div style={{ marginTop:5, color:'#80768f', fontSize:9 }}>{new Date(message.created_at).toLocaleString('fr-FR')}</div>
            </div>)}
          </div>
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={5} placeholder="Répondre à l’utilisateur…" style={{ width:'100%', marginTop:16, boxSizing:'border-box', borderRadius:12, padding:12, background:'#0d0a13', color:'#fff', border:'1px solid #3b3150' }}/>
          <button disabled={busy || !reply.trim()} onClick={() => void sendReply()} style={{ marginTop:8 }}>{busy ? 'Envoi…' : 'Envoyer la réponse Loki'}</button>
        </>}
      </div>
    </div>
  </AdminLayout>;
}
