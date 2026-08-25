import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../components/AdminLayout';

type SecretField = {
  key: string;
  label: string;
  category: 'E-mails' | 'Musique' | 'Reconnaissance';
  help: string;
};

type IntegrationStatus = {
  key: string;
  configured: boolean;
  hint?: string | null;
  updatedAt?: string | null;
};

const FIELDS: SecretField[] = [
  { key: 'BREVO_API_KEY', label: 'Brevo API transactionnelle', category: 'E-mails', help: 'Clé API Brevo utilisée pour l’envoi HTTP. Prioritaire si elle est configurée.' },
  { key: 'BREVO_SMTP_KEY', label: 'Brevo SMTP key', category: 'E-mails', help: 'Mot de passe SMTP Brevo. Toujours masqué et remplaçable depuis cet écran.' },
  { key: 'BREVO_SMTP_LOGIN', label: 'Brevo SMTP login', category: 'E-mails', help: 'Identifiant SMTP fourni par Brevo.' },
  { key: 'BREVO_SENDER_EMAIL', label: 'Adresse expéditeur', category: 'E-mails', help: 'Adresse vérifiée utilisée par KEEP pour les e-mails.' },
  { key: 'BREVO_SENDER_NAME', label: 'Nom expéditeur', category: 'E-mails', help: 'Nom visible par l’utilisateur, ex. KEEP.' },
  { key: 'SPOTIFY_CLIENT_ID', label: 'Spotify Client ID', category: 'Musique', help: 'Application Spotify OAuth.' },
  { key: 'SPOTIFY_CLIENT_SECRET', label: 'Spotify Client Secret', category: 'Musique', help: 'Secret Spotify OAuth. Jamais envoyé au mobile.' },
  { key: 'DEEZER_APP_ID', label: 'Deezer App ID', category: 'Musique', help: 'Application Deezer OAuth.' },
  { key: 'DEEZER_APP_SECRET', label: 'Deezer App Secret', category: 'Musique', help: 'Secret Deezer OAuth. Jamais envoyé au mobile.' },
  { key: 'APPLE_MUSICKIT_TEAM_ID', label: 'Apple Music Team ID', category: 'Musique', help: 'Identifiant équipe Apple Developer.' },
  { key: 'APPLE_MUSICKIT_KEY_ID', label: 'Apple Music Key ID', category: 'Musique', help: 'Identifiant de la clé MusicKit.' },
  { key: 'APPLE_MUSICKIT_PRIVATE_KEY', label: 'Apple Music Private Key', category: 'Musique', help: 'Clé privée MusicKit. Stockage chiffré uniquement.' },
  { key: 'AUDD_API_KEY', label: 'AudD API Key', category: 'Reconnaissance', help: 'Reconnaissance musicale réelle.' },
];

export default function IntegrationsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, IntegrationStatus>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<Record<string, string>>({});

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  const groups = useMemo(() => {
    return ['E-mails', 'Musique', 'Reconnaissance'].map((category) => ({
      category,
      fields: FIELDS.filter((f) => f.category === category),
    }));
  }, []);

  useEffect(() => {
    const load = async () => {
      const token = typeof window !== 'undefined' ? sessionStorage.getItem('keep-admin-access-token') : null;
      if (!apiUrl || !token) return;
      try {
        const res = await fetch(`${apiUrl}/api/admin/integrations`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const payload = await res.json();
        const indexed: Record<string, IntegrationStatus> = {};
        for (const item of payload.data || []) indexed[item.key] = item;
        setStatus(indexed);
      } catch {
        // Le preview statique reste utilisable sans backend.
      }
    };
    void load();
  }, [apiUrl]);

  const saveField = async (field: SecretField) => {
    const value = values[field.key]?.trim();
    if (!value) return;

    setBusy((s) => ({ ...s, [field.key]: true }));
    setMessage((s) => ({ ...s, [field.key]: '' }));

    try {
      const token = typeof window !== 'undefined' ? sessionStorage.getItem('keep-admin-access-token') : null;
      if (!apiUrl || !token) {
        setStatus((s) => ({ ...s, [field.key]: { key: field.key, configured: true } }));
        setValues((s) => ({ ...s, [field.key]: '' }));
        setMessage((s) => ({ ...s, [field.key]: 'Prévisualisation : champ prêt. En production, la valeur sera chiffrée côté backend.' }));
        return;
      }

      const res = await fetch(`${apiUrl}/api/admin/integrations/${field.key}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error(`Échec enregistrement ${field.label}`);
      const payload = await res.json();
      setStatus((s) => ({ ...s, [field.key]: payload.data }));
      setValues((s) => ({ ...s, [field.key]: '' }));
      setVisible((s) => ({ ...s, [field.key]: false }));
      setMessage((s) => ({ ...s, [field.key]: 'Enregistré et chiffré.' }));
    } catch (error: any) {
      setMessage((s) => ({ ...s, [field.key]: error?.message || 'Erreur pendant l’enregistrement.' }));
    } finally {
      setBusy((s) => ({ ...s, [field.key]: false }));
    }
  };

  return (
    <AdminLayout>
      <div className="page-title">Clés & intégrations</div>
      <div className="page-subtitle">Coffre centralisé — e-mails, plateformes musicales et reconnaissance</div>

      <div className="demo-banner" style={{ marginBottom: 24 }}>
        🔐 Les secrets enregistrés ne sont jamais affichés en clair. Pour changer une clé, saisis simplement la nouvelle valeur puis clique sur Remplacer.
      </div>

      {groups.map((group) => (
        <section key={group.category} style={{ marginBottom: 28 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>{group.category}</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {group.fields.map((field) => {
              const configured = Boolean(status[field.key]?.configured);
              const hint = status[field.key]?.hint;
              return (
                <div key={field.key} className="kpi-card" style={{ display: 'grid', gridTemplateColumns: 'minmax(210px, 1fr) minmax(260px, 1.4fr) auto', gap: 16, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{field.label}</div>
                    <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4 }}>{field.help}</div>
                    <div style={{ fontSize: 11, marginTop: 7, fontWeight: 700, color: configured ? '#34d399' : 'var(--muted)' }}>
                      {configured ? `● Configuré${hint ? ` — ${hint}` : ''}` : '○ Non configuré'}
                    </div>
                  </div>

                  <div>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={visible[field.key] ? 'text' : 'password'}
                        value={values[field.key] || ''}
                        onChange={(e) => setValues((s) => ({ ...s, [field.key]: e.target.value }))}
                        placeholder={configured ? '••••••••••••  saisir pour remplacer' : 'Saisir une nouvelle valeur'}
                        autoComplete="new-password"
                        style={{ width: '100%', boxSizing: 'border-box', padding: '12px 76px 12px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                      />
                      <button
                        type="button"
                        onClick={() => setVisible((s) => ({ ...s, [field.key]: !s[field.key] }))}
                        style={{ position: 'absolute', right: 8, top: 7, border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer', padding: 6 }}
                      >
                        {visible[field.key] ? 'Masquer' : 'Voir'}
                      </button>
                    </div>
                    {message[field.key] && <div style={{ fontSize: 11, marginTop: 6, color: 'var(--muted)' }}>{message[field.key]}</div>}
                  </div>

                  <button
                    type="button"
                    onClick={() => saveField(field)}
                    disabled={!values[field.key]?.trim() || busy[field.key]}
                    style={{ minWidth: 110, padding: '11px 14px', borderRadius: 999, border: 0, cursor: values[field.key]?.trim() && !busy[field.key] ? 'pointer' : 'not-allowed', background: values[field.key]?.trim() && !busy[field.key] ? 'var(--primary)' : 'var(--border)', color: '#fff', fontWeight: 800 }}
                  >
                    {busy[field.key] ? 'Enregistrement…' : configured ? 'Remplacer' : 'Enregistrer'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </AdminLayout>
  );
}
