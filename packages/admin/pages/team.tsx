import React, { FormEvent, useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';

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

async function invokeAdmin(body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase Super Admin non configuré.');
  const { data, error } = await supabase.functions.invoke('keep-admin-control', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.message || data.error);
  return data;
}

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

  const load = async () => {
    setError('');
    try {
      const result = await invokeAdmin({ action: 'admins.list' });
      setMembers((result?.data ?? []) as AdminMember[]);
    } catch (e: any) {
      setError(e?.message ?? 'Impossible de charger l’équipe Super Admin.');
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
    setNewPassword(''); setConfirmPassword('');
    setMessage('Ton mot de passe Super Admin a été modifié. Aucun e-mail n’a été envoyé.');
  };

  return (
    <AdminLayout>
      <div className="page-title">Équipe Super Admin</div>
      <div className="page-subtitle">Accès nominatifs, rôles séparés et désactivation sans supprimer les comptes KEEP.</div>

      {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
      {message && <div className="demo-banner" style={{ borderColor: '#2e7d32' }}>{message}</div>}

      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ marginTop: 0 }}>Ajouter un collaborateur</h3>
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.55 }}>
          Aucun lien magique n’est envoyé. Si l’adresse n’a pas encore de compte KEEP, un compte est créé avec un mot de passe temporaire affiché une seule fois. Si elle a déjà un compte KEEP, son compte utilisateur est conservé et seul le rôle d’administration est ajouté.
        </p>
        <form onSubmit={createMember} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,2fr) minmax(220px,1fr) auto', gap: 10 }}>
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
        <h3 style={{ marginTop: 0 }}>Membres autorisés</h3>
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

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Modifier mon mot de passe</h3>
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>Modification directe du mot de passe de la session Super Admin actuelle, sans e-mail.</p>
        <form onSubmit={changeOwnPassword} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10 }}>
          <input type={showPassword ? 'text' : 'password'} placeholder="Nouveau mot de passe" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={inputStyle} />
          <input type={showPassword ? 'text' : 'password'} placeholder="Confirmer" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={inputStyle} />
          <button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Masquer' : 'Voir'}</button>
          <button type="submit" disabled={busy || !newPassword || !confirmPassword} style={{ gridColumn: '1 / -1' }}>Enregistrer mon mot de passe</button>
        </form>
      </div>
    </AdminLayout>
  );
}

const inputStyle: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 14px' };
const smallInputStyle: React.CSSProperties = { ...inputStyle, padding: '7px 10px' };
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 8px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' };
const td: React.CSSProperties = { padding: '12px 8px', borderBottom: '1px solid var(--border)' };
