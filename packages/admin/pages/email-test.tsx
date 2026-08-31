import React, { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';

async function invokeControl(body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase Super Admin non configuré.');
  const { data, error } = await supabase.functions.invoke('keep-admin-control', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.message || data.details || data.error);
  return data;
}

async function invokeEmailAdmin(body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase Super Admin non configuré.');
  const { data, error } = await supabase.functions.invoke('keep-email-admin', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.message || data.error);
  return data;
}

type DeliverySummary = { total: number; sent: number; delivered: number; failed: number; deferred: number };
type DeliveryDiagnostics = {
  last24h: DeliverySummary;
  last7d: DeliverySummary;
  recent: Array<{
    eventType: string;
    occurredAt: string;
    messageId?: string | null;
    recipientEmail: string;
    subject?: string | null;
    reason?: string | null;
  }>;
  webhookTokenConfigured: boolean;
  brevoConfigured: boolean;
};

const emptySummary: DeliverySummary = { total: 0, sent: 0, delivered: 0, failed: 0, deferred: 0 };

export default function EmailTestPage() {
  const [email, setEmail] = useState('adel.khatra@live.fr');
  const [busy, setBusy] = useState(false);
  const [webhookBusy, setWebhookBusy] = useState(false);
  const [result, setResult] = useState('');
  const [status, setStatus] = useState('Vérification Brevo…');
  const [delivery, setDelivery] = useState<DeliveryDiagnostics>({
    last24h: emptySummary,
    last7d: emptySummary,
    recent: [],
    webhookTokenConfigured: false,
    brevoConfigured: false,
  });

  const refreshDiagnostics = useCallback(async () => {
    const payload = await invokeEmailAdmin({ action: 'diagnostics' });
    setDelivery({
      last24h: payload?.last24h ?? emptySummary,
      last7d: payload?.last7d ?? emptySummary,
      recent: Array.isArray(payload?.recent) ? payload.recent : [],
      webhookTokenConfigured: Boolean(payload?.webhookTokenConfigured),
      brevoConfigured: Boolean(payload?.brevoConfigured),
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [payload] = await Promise.all([
          invokeControl({ action: 'integrations.list' }),
          refreshDiagnostics(),
        ]);
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
  }, [refreshDiagnostics]);

  const sendTest = async () => {
    setBusy(true);
    setResult('');
    try {
      const payload = await invokeControl({ action: 'integrations.test_email', email });
      setResult(`✅ E-mail accepté par Brevo pour ${email}${payload?.messageId ? ` · ID ${payload.messageId}` : ''}. La délivrabilité sera mise à jour par le webhook.`);
      window.setTimeout(() => { void refreshDiagnostics(); }, 2500);
    } catch (error: any) {
      setResult(`❌ ${error?.message || 'Échec du test Brevo.'}`);
    } finally {
      setBusy(false);
    }
  };

  const ensureWebhook = async () => {
    setWebhookBusy(true);
    setResult('');
    try {
      const payload = await invokeEmailAdmin({ action: 'ensure_webhook' });
      setResult(`✅ Suivi Brevo ${payload?.mode === 'created' ? 'créé' : 'vérifié et réparé'}${payload?.webhookId ? ` · webhook #${payload.webhookId}` : ''}. Le secret est généré et conservé uniquement dans Supabase.`);
      await refreshDiagnostics();
    } catch (error: any) {
      setResult(`❌ ${error?.message || 'Impossible de configurer le suivi Brevo.'}`);
    } finally {
      setWebhookBusy(false);
    }
  };

  const metric = (label: string, value: number) => (
    <div style={{ padding: 12, borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border)', minWidth: 105 }}>
      <div style={{ fontSize: 22, fontWeight: 900 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{label}</div>
    </div>
  );

  return (
    <AdminLayout>
      <div className="page-title">Test e-mail Brevo</div>
      <div className="page-subtitle">Vérification réelle du circuit Loki → Supabase sécurisé → Brevo → boîte mail</div>

      <div className="kpi-card" style={{ maxWidth: 900, marginTop: 24 }}>
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
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={sendTest}
            disabled={busy || !email.includes('@')}
            style={{ padding: '12px 18px', border: 0, borderRadius: 999, background: 'var(--primary)', color: '#fff', fontWeight: 800, cursor: busy ? 'wait' : 'pointer' }}
          >
            {busy ? 'Envoi en cours…' : 'Envoyer un e-mail de test'}
          </button>
          <button
            type="button"
            onClick={ensureWebhook}
            disabled={webhookBusy || !delivery.brevoConfigured}
            style={{ padding: '12px 18px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontWeight: 800, cursor: webhookBusy ? 'wait' : 'pointer' }}
          >
            {webhookBusy ? 'Configuration…' : delivery.webhookTokenConfigured ? 'Vérifier / réparer le suivi Brevo' : 'Activer le suivi de délivrabilité'}
          </button>
        </div>
        {result && <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)' }}>{result}</div>}
        <div style={{ marginTop: 16, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
          Aucun secret Brevo n’est envoyé au navigateur. Le webhook utilise un jeton distinct généré automatiquement et conservé dans le Vault Supabase.
        </div>
      </div>

      <div className="kpi-card" style={{ maxWidth: 900, marginTop: 18 }}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>Délivrabilité réelle — dernières 24 h</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {metric('Événements', delivery.last24h.total)}
          {metric('Envoyés', delivery.last24h.sent)}
          {metric('Délivrés', delivery.last24h.delivered)}
          {metric('Différés', delivery.last24h.deferred)}
          {metric('Échecs', delivery.last24h.failed)}
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>
          7 jours : {delivery.last7d.delivered} délivrés · {delivery.last7d.failed} échecs · {delivery.last7d.deferred} différés.
        </div>

        {delivery.recent.length > 0 ? (
          <div style={{ marginTop: 18, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={{ padding: '8px 6px' }}>État</th>
                  <th style={{ padding: '8px 6px' }}>Destinataire</th>
                  <th style={{ padding: '8px 6px' }}>Objet</th>
                  <th style={{ padding: '8px 6px' }}>Date</th>
                  <th style={{ padding: '8px 6px' }}>Erreur</th>
                </tr>
              </thead>
              <tbody>
                {delivery.recent.slice(0, 20).map((row, index) => (
                  <tr key={`${row.messageId || 'mail'}-${row.occurredAt}-${index}`} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 6px', fontWeight: 800 }}>{row.eventType}</td>
                    <td style={{ padding: '8px 6px' }}>{row.recipientEmail}</td>
                    <td style={{ padding: '8px 6px' }}>{row.subject || '—'}</td>
                    <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{new Date(row.occurredAt).toLocaleString('fr-FR')}</td>
                    <td style={{ padding: '8px 6px' }}>{row.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ marginTop: 16, color: 'var(--muted)', fontSize: 12 }}>
            Aucun événement Brevo reçu pour l’instant. Active le suivi puis envoie un e-mail de test.
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
