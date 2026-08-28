import React, { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';

async function invokeAdmin(body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase Super Admin non configuré.');
  const { data, error } = await supabase.functions.invoke('keep-admin-control', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.message || data.details || data.error);
  return data;
}

export default function EmailTestPage() {
  const [email, setEmail] = useState('adel.khatra@live.fr');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const [status, setStatus] = useState('Vérification Brevo…');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const payload = await invokeAdmin({ action: 'integrations.list' });
        const rows = Array.isArray(payload?.data) ? payload.data : [];
        const apiKey = rows.find((row: any) => row.key === 'BREVO_API_KEY');
        const sender = rows.find((row: any) => row.key === 'BREVO_SENDER_EMAIL');
        if (!cancelled) {
          setStatus(apiKey?.configured && sender?.configured
            ? 'Brevo configuré côté Supabase sécurisé.'
            : 'Brevo incomplet : renseigne BREVO_API_KEY et BREVO_SENDER_EMAIL dans Clés & intégrations.');
        }
      } catch (error: any) {
        if (!cancelled) setStatus(error?.message || 'Impossible de vérifier Brevo.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const sendTest = async () => {
    setBusy(true);
    setResult('');
    try {
      const payload = await invokeAdmin({ action: 'integrations.test_email', email });
      setResult(`✅ E-mail accepté par Brevo pour ${email}${payload?.messageId ? ` · ID ${payload.messageId}` : ''}.`);
    } catch (error: any) {
      setResult(`❌ ${error?.message || 'Échec du test Brevo.'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminLayout>
      <div className="page-title">Test e-mail Brevo</div>
      <div className="page-subtitle">Vérification réelle du circuit KEEP → Supabase sécurisé → Brevo → boîte mail</div>
      <div className="kpi-card" style={{ maxWidth: 680, marginTop: 24 }}>
        <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 12 }}>
          {status}
        </div>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Adresse de réception</div>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', marginBottom: 14 }}
        />
        <button
          type="button"
          onClick={sendTest}
          disabled={busy || !email.includes('@')}
          style={{ padding: '12px 18px', border: 0, borderRadius: 999, background: 'var(--primary)', color: '#fff', fontWeight: 800, cursor: busy ? 'wait' : 'pointer' }}
        >
          {busy ? 'Envoi en cours…' : 'Envoyer un e-mail de test'}
        </button>
        {result && <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)' }}>{result}</div>}
        <div style={{ marginTop: 16, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
          Ce bouton utilise la session Supabase Super Admin réellement ouverte. Aucun faux succès n’est affiché et aucune clé Brevo n’est envoyée au navigateur.
        </div>
      </div>
    </AdminLayout>
  );
}
