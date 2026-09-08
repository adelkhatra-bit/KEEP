import React, { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';

type FieldStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

type QueueItem = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  starts_at: string;
  venue_name: string | null;
  creator_id: string;
  creator_username: string;
  created_at: string;
  moderation_status: string;
  photo_status: FieldStatus;
  photo_note: string | null;
  text_status: FieldStatus;
  text_note: string | null;
  moderation_flag: boolean;
  moderation_flag_reason: string | null;
  require_qr_code: boolean;
  include_rsvp_buttons: boolean;
};

async function invokeControl(body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase Super Admin non configuré.');
  const { data, error } = await supabase.functions.invoke('keep-admin-control', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.message || data.error);
  return data;
}

const FIELD_LABEL: Record<'photo' | 'text', string> = { photo: 'Photo', text: 'Texte' };

function StatusPill({ status }: { status: FieldStatus }) {
  const map: Record<FieldStatus, { bg: string; border: string; color: string; label: string }> = {
    PENDING: { bg: 'rgba(255,209,102,.12)', border: '#FFD166', color: '#FFD166', label: 'En attente' },
    APPROVED: { bg: 'rgba(56,217,144,.12)', border: '#38D990', color: '#38D990', label: 'Approuvé' },
    REJECTED: { bg: 'rgba(255,95,131,.12)', border: '#FF5F83', color: '#FF5F83', label: 'Refusé' },
  };
  const s = map[status];
  return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, background: s.bg, border: `1px solid ${s.border}`, color: s.color, fontSize: 11, fontWeight: 800 }}>{s.label}</span>;
}

export default function Moderation() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [noteOpenKey, setNoteOpenKey] = useState<string | null>(null);
  // Adel (08/09/2026) : "on peut approuver les deux en même temps pour
  // éviter les doubles notifications ... une seule notification" -- deja
  // le comportement du serveur (admin_event_approve ne notifie qu'une fois,
  // au moment où photo ET texte basculent APPROVED) ; ce bouton n'ajoute
  // qu'un raccourci pratique cote UI, aucune logique de notification ici.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await invokeControl({ action: 'moderation.events_pending' });
      setQueue((data?.data ?? []) as QueueItem[]);
    } catch (e: any) {
      setError(e?.message ?? 'Impossible de charger la file de modération.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const decide = async (eventId: string, field: 'photo' | 'text', decision: 'APPROVE' | 'REJECT', note?: string) => {
    const key = `${eventId}:${field}`;
    setBusyKey(key);
    try {
      await invokeControl({ action: 'moderation.field_decide', eventId, field, decision, note: note || undefined });
      setNoteOpenKey(null);
      setNoteDraft((d) => ({ ...d, [key]: '' }));
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Action impossible pour le moment.');
    } finally {
      setBusyKey(null);
    }
  };

  const approveBoth = async (eventId: string) => {
    const key = `${eventId}:both`;
    setBusyKey(key);
    try {
      await invokeControl({ action: 'moderation.events_approve', eventId });
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Action impossible pour le moment.');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <AdminLayout>
      <div className="page-title">Approuver</div>
      <div className="page-subtitle">Photo et texte de chaque évènement sont validés séparément avant d’être visibles aux utilisateurs. Un refus envoie une notification à l’organisateur avec ta note ; une fois les deux approuvés, l’invitation part automatiquement à sa communauté.</div>

      {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
      {loading ? <p style={{ color: 'var(--text-muted)' }}>Chargement…</p> : null}
      {!loading && !queue.length ? <div className="card"><p style={{ margin: 0, color: 'var(--text-muted)' }}>Aucun évènement en attente de validation.</p></div> : null}

      <div style={{ display: 'grid', gap: 18 }}>
        {queue.map((item) => (
          <div key={item.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {item.moderation_flag ? (
              <div style={{ padding: '8px 16px', background: 'rgba(255,95,131,.14)', borderBottom: '1px solid #FF5F83', color: '#FF9FB3', fontSize: 12, fontWeight: 800 }}>
                ⚠️ Suspicion automatique — {item.moderation_flag_reason || 'à vérifier manuellement'}
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 16, padding: 16, flexWrap: 'wrap' }}>
              {item.image_url ? (
                <img src={item.image_url} alt={item.name} style={{ width: 220, maxWidth: '100%', height: 220, objectFit: 'contain', background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)' }} />
              ) : (
                <div style={{ width: 220, height: 220, borderRadius: 12, border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Aucune photo</div>
              )}
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <h3 style={{ margin: 0 }}>{item.name}</h3>
                  {item.require_qr_code ? <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)' }}>🎟 QR requis</span> : null}
                  {!item.include_rsvp_buttons ? <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)' }}>🔕 Notif. sans boutons</span> : null}
                  {item.photo_status === 'APPROVED' && item.text_status === 'APPROVED' ? null : (
                    <button
                      disabled={busyKey === `${item.id}:both`}
                      onClick={() => void approveBoth(item.id)}
                      style={{ marginLeft: 'auto', background: '#38D990', color: '#0B1F16', border: 'none', padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 900, cursor: busyKey === `${item.id}:both` ? 'default' : 'pointer', opacity: busyKey === `${item.id}:both` ? 0.6 : 1 }}
                    >
                      ✓✓ Tout approuver
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                  @{item.creator_username} · {new Date(item.starts_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}{item.venue_name ? ` · ${item.venue_name}` : ''}
                </div>
                {/* Adel (08/09/2026) : "un bouton en savoir plus pour le
                    texte qui soit plié ... pour pas que ça encombre" quand
                    il y a beaucoup d'évènements en attente. */}
                {item.description ? (
                  <div style={{ marginBottom: 12 }}>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                      {expanded[item.id] || item.description.length <= 180 ? item.description : `${item.description.slice(0, 180)}…`}
                    </p>
                    {item.description.length > 180 ? (
                      <button
                        onClick={() => setExpanded((e) => ({ ...e, [item.id]: !e[item.id] }))}
                        style={{ marginTop: 4, background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: 12, fontWeight: 800, cursor: 'pointer', padding: 0 }}
                      >
                        {expanded[item.id] ? '‹ Replier' : 'En savoir plus ›'}
                      </button>
                    ) : null}
                  </div>
                ) : <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-muted)' }}>Pas de description.</p>}

                {(['photo', 'text'] as const).map((field) => {
                  const status = field === 'photo' ? item.photo_status : item.text_status;
                  const note = field === 'photo' ? item.photo_note : item.text_note;
                  const key = `${item.id}:${field}`;
                  const busy = busyKey === key;
                  return (
                    <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                      <strong style={{ fontSize: 12, minWidth: 50 }}>{FIELD_LABEL[field]}</strong>
                      <StatusPill status={status} />
                      {note ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>« {note} »</span> : null}
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        <button className="btn" disabled={busy || status === 'APPROVED'} onClick={() => void decide(item.id, field, 'APPROVE')} style={{ background: '#38D990', color: '#0B1F16', border: 'none', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: busy ? 'default' : 'pointer', opacity: busy || status === 'APPROVED' ? 0.6 : 1 }}>✓ Approuver</button>
                        <button className="btn" disabled={busy} onClick={() => setNoteOpenKey(noteOpenKey === key ? null : key)} style={{ background: 'transparent', color: '#FF5F83', border: '1px solid #FF5F83', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>✕ Refuser</button>
                      </div>
                      {noteOpenKey === key ? (
                        <div style={{ width: '100%', display: 'flex', gap: 8, marginTop: 6 }}>
                          <input
                            value={noteDraft[key] || ''}
                            onChange={(e) => setNoteDraft((d) => ({ ...d, [key]: e.target.value }))}
                            placeholder={`Pourquoi ${FIELD_LABEL[field].toLowerCase()} est refusé (envoyé à l’organisateur)`}
                            style={{ flex: 1, minWidth: 200, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12 }}
                          />
                          <button disabled={busy} onClick={() => void decide(item.id, field, 'REJECT', noteDraft[key] || '')} style={{ background: '#FF5F83', color: '#2A0510', border: 'none', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: busy ? 'default' : 'pointer' }}>Envoyer le refus</button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}
