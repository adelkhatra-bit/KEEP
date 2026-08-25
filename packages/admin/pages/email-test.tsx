import React, { useState } from 'react';
import AdminLayout from '../components/AdminLayout';

export default function EmailTestPage() {
  const [email, setEmail] = useState('adel.khatra@live.fr');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  const sendTest = async () => {
    setBusy(true);
    setResult('');
    try {
      const token = typeof window !== 'undefined' ? sessionStorage.getItem('keep-admin-access-token') : null;
      if (!apiUrl || !token) {
        throw new Error('Backend/session Super Admin réelle non connectée. Aucun e-mail n’a été envoyé.');
      }
      const res = await fetch(`${apiUrl}/api/admin/integrations/email/test`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(typeof payload.error === 'string' ? payload.error : JSON.stringify(payload.error || payload));
      setResult(`✅ E-mail envoyé à ${email} via Brevo.`);
    } catch (error: any) {
      setResult(`❌ ${error?.message || 'Échec du test Brevo.'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminLayout>
      <div className="page-title">Test e-mail Brevo</div>
      <div className="page-subtitle">Vérification réelle du circuit KEEP → backend → Brevo → boîte mail</div>
      <div className="kpi-card" style={{ maxWidth: 680, marginTop: 24 }}>
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
          Ce bouton n’affiche jamais un faux succès : si le backend, la session Admin ou Brevo ne sont pas réellement configurés, le test reste en erreur.
        </div>
      </div>
    </AdminLayout>
  );
}
