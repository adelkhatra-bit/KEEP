import React, { FormEvent, useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import Hint from '../components/Hint';
import { supabase } from '../lib/supabaseClient';
import { invokeAdminFunction } from '../lib/invokeFunction';

type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT' | 'FINANCE' | 'MARKETING' | 'MODERATOR' | 'TECH';
type AdminMember = { id: string; email: string | null; role: AdminRole; isActive: boolean; createdAt: string };

const ROLES: { value: Exclude<AdminRole, 'SUPER_ADMIN'>; label: string }[] = [
  { value: 'ADMIN', label: 'Administrateur général' },
  { value: 'SUPPORT', label: 'Support / utilisateurs' },
  { value: 'FINANCE', label: 'Comptabilité / finance' },
  { value: 'MARKETING', label: 'Marketing / contenus' },
  { value: 'MODERATOR', label: 'Modération' },
  { value: 'TECH', label: 'Technique / intégrations' },
];

const invokeAdmin = (body: Record<string, unknown>) => invokeAdminFunction('keep-admin-control', body);

export default function TeamPage() {
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<AdminRole, 'SUPER_ADMIN'>>('SUPPORT');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [copiedGenerated, setCopiedGenerated] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryExpiresAt, setRecoveryExpiresAt] = useState('');
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [copiedRecovery, setCopiedRecovery] = useState(false);
  const autoRecoveryStarted = React.useRef(false);

  const load = async () => {
    setError('');
    try {
      const result = await invokeAdmin({ action: 'admins.list' });
      setMembers((result?.data ?? []) as AdminMember[]);
    } catch (e: any) {
      setError(e?.message ?? 'Impossible de charger Loki Super Admin.');
    }
  };

  useEffect(() => { void load(); }, []);

  const createMember = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalized)) {
      setError('Saisis une adresse e-mail valide.');
      return;
    }
    setBusy(true); setError(''); setMessage(''); setTemporaryPassword('');
    try {
      const result = await invokeAdmin({ action: 'admins.create', email: normalized, role });
      setTemporaryPassword(String(result?.temporaryPassword || ''));
      setMessage(result?.temporaryPassword
        ? `Accès ${role} créé. Le mot de passe temporaire est affiché une seule fois ci-dessous.`
        : `Le compte existant a reçu le rôle ${role}. Son mot de passe utilisateur actuel reste inchangé.`);
      setEmail('');
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Création de l’accès impossible.');
    } finally {
      setBusy(false);
    }
  };

  const updateMember = async (member: AdminMember, nextRole: AdminRole, isActive: boolean) => {
    setBusy(true); setError(''); setMessage('');
    try {
      await invokeAdmin({ action: 'admins.update', adminId: member.id, role: nextRole, isActive });
      setMessage(`Accès ${member.email || member.id} mis à jour.`);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Modification impossible.');
    } finally {
      setBusy(false);
    }
  };

  const generateStrongPassword = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_+';
    const bytes = new Uint32Array(22);
    crypto.getRandomValues(bytes);
    const value = Array.from(bytes, (n) => alphabet[n % alphabet.length]).join('');
    setGeneratedPassword(value);
    setNewPassword(value);
    setConfirmPassword(value);
    setShowPassword(true);
    setCopiedGenerated(false);
    setError('');
    setMessage('Mot de passe fort généré localement dans ton navigateur. Clique sur « Enregistrer mon mot de passe » pour l’activer.');
  };

  const copyGeneratedPassword = async () => {
    if (!generatedPassword) return;
    try {
      await navigator.clipboard.writeText(generatedPassword);
      setCopiedGenerated(true);
      window.setTimeout(() => setCopiedGenerated(false), 1800);
    } catch {
      setError('Copie automatique impossible. Sélectionne le mot de passe affiché manuellement.');
    }
  };

  const issueRecoveryCode = async () => {
    setRecoveryBusy(true); setError(''); setMessage(''); setRecoveryCode(''); setRecoveryExpiresAt(''); setCopiedRecovery(false);
    try {
      const result = await invokeAdmin({ action: 'admins.issue_self_recovery' });
      setRecoveryCode(String(result?.recoveryCode || ''));
      setRecoveryExpiresAt(String(result?.expiresAt || ''));
      setMessage('Code de secours créé. Copie-le maintenant : il est affiché une seule fois et pourra être utilisé dans le champ Mot de passe si tu perds l’accès.');
    } catch (e: any) {
      setError(e?.message ?? 'Impossible de générer le code de secours.');
    } finally {
      setRecoveryBusy(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined' || autoRecoveryStarted.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('issueRecovery') !== '1') return;
    autoRecoveryStarted.current = true;
    void issueRecoveryCode().finally(() => {
      try {
        const clean = new URL(window.location.href);
        clean.searchParams.delete('issueRecovery');
        window.history.replaceState({}, document.title, clean.pathname + clean.search + '#recovery-security');
      } catch {}
    });
  }, []);

  const copyRecoveryCode = async () => {
    if (!recoveryCode) return;
    try {
      await navigator.clipboard.writeText(recoveryCode);
      setCopiedRecovery(true);
      window.setTimeout(() => setCopiedRecovery(false), 1800);
    } catch {
      setError('Copie automatique impossible. Sélectionne le code affiché manuellement.');
    }
  };

  const changeOwnPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    if (newPassword.length < 10) {
      setError('Choisis un mot de passe d’au moins 10 caractères.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setBusy(true); setError(''); setMessage('');
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (updateError) {
      setError(updateError.message || 'Impossible de modifier le mot de passe.');
      return;
    }
    setNewPassword(''); setConfirmPassword(''); setGeneratedPassword(''); setCopiedGenerated(false);
    setMessage('Ton mot de passe Super Admin a été modifié. Aucun e-mail n’a été envoyé.');
  };

  return (
    <AdminLayout>
      <div className="page-title">Équipe <Hint title="Équipe" text={<>Accès nominatifs, rôles séparés et désactivation sans supprimer les comptes Loki Music.</>}/></div>

      {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
      {message && <div className="demo-banner" style={{ borderColor: '#2e7d32' }}>{message}</div>}

      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ marginTop: 0 }}>Ajouter</h3>
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.55 }}>
          Aucun lien magique n’est envoyé. Si l’adresse n’a pas encore de compte Loki Music, un compte est créé avec un mot de passe temporaire affiché une seule fois. Si elle a déjà un compte Loki Music, son compte utilisateur est conservé et seul le rôle d’administration est ajouté.
        </p>
        <form onSubmit={createMember} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 10 }}>
          <input type="email" placeholder="collaborateur@email.fr" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
          <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} style={inputStyle}>
            {ROLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <button type="submit" disabled={busy || !email.trim()}>{busy ? 'Création…' : 'Ajouter'}</button>
        </form>
        {temporaryPassword && (
          <div style={{ marginTop: 14, padding: 14, border: '1px solid #6d5a93', borderRadius: 12, background: '#120e1b' }}>
            <div style={{ fontWeight: 800 }}>Mot de passe temporaire</div>
            <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 18, wordBreak: 'break-all' }}>{temporaryPassword}</div>
            <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: 12 }}>Copie-le maintenant puis demande au collaborateur de le modifier après sa première connexion.</div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ marginTop: 0 }}>Membres</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>E-mail</th><th style={th}>Rôle</th><th style={th}>État</th><th style={th}>Action</th></tr></thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td style={td}>{member.email || member.id}</td>
                  <td style={td}>
                    {member.role === 'SUPER_ADMIN' ? <strong>SUPER_ADMIN</strong> : (
                      <select value={member.role} disabled={busy} onChange={(e) => void updateMember(member, e.target.value as AdminRole, member.isActive)} style={smallInputStyle}>
                        {ROLES.map((item) => <option key={item.value} value={item.value}>{item.value}</option>)}
                      </select>
                    )}
                  </td>
                  <td style={td}>{member.isActive ? 'Actif' : 'Désactivé'}</td>
                  <td style={td}>
                    {member.role === 'SUPER_ADMIN' ? <span style={{ color: 'var(--text-muted)' }}>Protégé</span> : (
                      <button disabled={busy} onClick={() => void updateMember(member, member.role, !member.isActive)}>
                        {member.isActive ? 'Désactiver' : 'Réactiver'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 22 }} id="recovery-security">
        <h3 style={{ marginTop: 0 }}>Secours <Hint title="Secours" text="Code de secours pour te connecter sans e-mail."/></h3>
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
          À utiliser uniquement si tu oublies ton mot de passe et que les e-mails sont indisponibles. Le code est généré depuis ta session SUPER_ADMIN, stocké uniquement sous forme de hash, valable 7 jours et consommé à la première utilisation.
        </p>
        <button type="button" disabled={recoveryBusy} onClick={()=>void issueRecoveryCode()}>
          {recoveryBusy ? 'Génération…' : 'GÉNÉRER UN CODE DE SECOURS'}
        </button>
        {recoveryCode && (
          <div style={{ marginTop: 14, padding: 14, border: '1px solid #8b6bc2', borderRadius: 12, background: '#120e1b' }}>
            <div style={{ fontWeight: 900 }}>Code de secours Super Admin</div>
            <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 18, wordBreak: 'break-all' }}>{recoveryCode}</div>
            <div style={{ marginTop: 8, display:'flex', gap:8, flexWrap:'wrap' }}>
              <button type="button" onClick={()=>void copyRecoveryCode()}>{copiedRecovery ? 'Copié ✓' : 'Copier le code'}</button>
            </div>
            <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 12 }}>
              Expire : {recoveryExpiresAt ? new Date(recoveryExpiresAt).toLocaleString('fr-FR') : '—'}. Si tu dois l’utiliser, entre ce code directement dans le champ « Mot de passe » de la connexion Super Admin.
            </div>
          </div>
        )}
      </div>

      <div className="card" id="password-security">
        <h3 style={{ marginTop: 0 }}>Mot de passe</h3>
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>Modification directe du mot de passe de la session Super Admin actuelle, sans e-mail.</p>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', margin:'12px 0' }}>
          <button type="button" onClick={generateStrongPassword}>Générer un mot de passe fort</button>
          {generatedPassword && <button type="button" onClick={()=>void copyGeneratedPassword()}>{copiedGenerated ? 'Copié ✓' : 'Copier le mot de passe'}</button>}
        </div>
        {generatedPassword && <div style={{ marginBottom:12, padding:12, border:'1px solid #6d5a93', borderRadius:10, background:'#120e1b' }}>
          <div style={{ color:'var(--text-muted)', fontSize:12 }}>Nouveau mot de passe généré</div>
          <div style={{ marginTop:6, fontFamily:'monospace', fontSize:17, fontWeight:900, wordBreak:'break-all' }}>{generatedPassword}</div>
        </div>}
        <form onSubmit={changeOwnPassword} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
          <input type={showPassword ? 'text' : 'password'} placeholder="Nouveau mot de passe" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={inputStyle} />
          <input type={showPassword ? 'text' : 'password'} placeholder="Confirmer" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={inputStyle} />
          <button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Masquer' : 'Voir'}</button>
          <button type="submit" disabled={busy || !newPassword || !confirmPassword} style={{ gridColumn: '1 / -1' }}>Enregistrer mon mot de passe</button>
        </form>
      </div>
    </AdminLayout>
  );
}

const inputStyle: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 14px', minWidth: 0, maxWidth: '100%' };
const smallInputStyle: React.CSSProperties = { ...inputStyle, padding: '7px 10px' };
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 8px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' };
const td: React.CSSProperties = { padding: '12px 8px', borderBottom: '1px solid var(--border)' };
