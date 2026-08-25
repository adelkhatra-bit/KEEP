import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

/**
 * Connexion Super Admin réelle (demande explicite du 24/08/2026 -- gap
 * trouvé en audit : `AdminLayout.tsx` avertissait depuis le début
 * "Authentification Super Admin non branchée", mais rien n'existait pour la
 * brancher). Réutilise le MÊME client Supabase que le reste de l'admin
 * (`lib/supabaseClient.ts`) -- aucun deuxième système d'auth, juste
 * `signInWithPassword` (email+mot de passe, standard pour un panneau admin
 * à quelques opérateurs de confiance, contrairement au code OTP mobile
 * pensé pour le grand public).
 *
 * Ne crée AUCUN compte -- l'admin doit déjà exister (créé par Adel via le
 * dashboard Supabase, avec un mot de passe) ET avoir une ligne
 * `admin_users` (RLS `is_admin()`, voir migration 0017) pour que les
 * appels `/api/admin/*` réussissent après connexion. Une connexion réussie
 * mais sans ligne `admin_users` affichera un 403 clair sur chaque page,
 * jamais une fausse impression d'accès.
 */
export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.push('/');
  };

  if (!isSupabaseConfigured) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.logo}>KEEP</div>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Supabase non configuré (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY manquants) -- impossible de se connecter.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <form style={styles.card} onSubmit={handleSubmit}>
        <div style={styles.logo}>KEEP</div>
        <div style={styles.subtitle}>Super Admin</div>
        <input
          type="email"
          placeholder="Adresse e-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          style={styles.input}
        />
        <input
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          style={styles.input}
        />
        {error && <p style={styles.error}>{error}</p>}
        <button type="submit" disabled={busy} style={styles.button}>
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>
        <p style={styles.hint}>
          Compte créé depuis le dashboard Supabase (Authentication → Users). Nécessite en plus une ligne
          `admin_users` pour accéder aux données réelles.
        </p>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg)',
  },
  card: {
    width: 340,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 32,
  },
  logo: { fontSize: 22, fontWeight: 900, color: 'var(--text)' },
  subtitle: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 },
  input: {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 13,
  },
  button: {
    background: 'var(--primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 12px',
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
    marginTop: 4,
  },
  error: { color: 'var(--danger, #ff5c5c)', fontSize: 12, margin: 0 },
  hint: { color: 'var(--text-muted)', fontSize: 11, marginTop: 8, lineHeight: 1.4 },
};
