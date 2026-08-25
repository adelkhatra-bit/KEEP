import type { AppProps } from 'next/app';
import { FormEvent, useEffect, useState } from 'react';
import '../styles/globals.css';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

const ADMIN_EMAIL = 'adel.khatra@live.fr';

type AuthState = 'checking' | 'signed_out' | 'code_sent' | 'checking_role' | 'allowed' | 'forbidden';

function LiveMarker() {
  return (
    <div style={{ position: 'fixed', top: 10, right: 10, zIndex: 99999, background: '#22c55e', color: '#07110a', borderRadius: 999, padding: '7px 11px', fontSize: 11, fontWeight: 900, letterSpacing: 0.7, boxShadow: '0 4px 18px rgba(34,197,94,.28)' }}>
      KEEP LIVE · RECONCILE · 25/08/2026
    </div>
  );
}

async function hasActiveAdminRole(userId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from('admin_users')
    .select('id, role, is_active')
    .eq('id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (error || !data) return false;
  return data.role === 'SUPER_ADMIN' || data.role === 'ADMIN';
}

function AdminLogin({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const sendCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError('');
    setInfo('');
    const normalized = email.trim().toLowerCase();
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (sendError) {
      setError(sendError.message);
      return;
    }
    setStep('code');
    setInfo(`Code envoyé à ${normalized}`);
  };

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError('');
    const normalized = email.trim().toLowerCase();
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email: normalized,
      token: code.trim(),
      type: 'email',
    });
    if (verifyError || !data.user) {
      setBusy(false);
      setError(verifyError?.message || 'Code invalide ou expiré.');
      return;
    }
    const allowed = await hasActiveAdminRole(data.user.id);
    if (!allowed) {
      await supabase.auth.signOut();
      setBusy(false);
      setError('Ce compte est authentifié mais n’a pas un rôle Super Admin actif.');
      return;
    }
    setBusy(false);
    onAuthenticated();
  };

  if (!isSupabaseConfigured) {
    return (
      <main style={pageStyle}>
        <LiveMarker />
        <div style={cardStyle}>
          <div style={brandStyle}>KEEP</div>
          <h1 style={titleStyle}>Super Admin</h1>
          <p style={mutedStyle}>Supabase n’est pas configuré dans cet environnement. Il faut NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY.</p>
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <LiveMarker />
      <form onSubmit={step === 'email' ? sendCode : verifyCode} style={cardStyle}>
        <div style={brandStyle}>KEEP</div>
        <h1 style={titleStyle}>Super Admin</h1>
        <p style={mutedStyle}>Connexion sécurisée au vrai projet KEEP. Un code est envoyé par e-mail.</p>

        <label style={labelStyle}>E-mail</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={step === 'code'}
          autoComplete="email"
          style={inputStyle}
        />

        {step === 'code' && (
          <>
            <label style={labelStyle}>Code à 6 chiffres</label>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              style={{ ...inputStyle, letterSpacing: 8, fontSize: 22, textAlign: 'center' }}
              autoFocus
            />
          </>
        )}

        {info && <p style={{ color: '#86efac', margin: '10px 0 0' }}>{info}</p>}
        {error && <p style={{ color: '#fb7185', margin: '10px 0 0' }}>{error}</p>}

        <button type="submit" disabled={busy || (step === 'code' && code.length !== 6)} style={buttonStyle}>
          {busy ? 'Connexion…' : step === 'email' ? 'Recevoir mon code' : 'Valider le code'}
        </button>

        {step === 'code' && (
          <button type="button" onClick={() => { setStep('email'); setCode(''); setError(''); setInfo(''); }} style={secondaryButtonStyle}>
            Changer d’e-mail / renvoyer
          </button>
        )}
      </form>
    </main>
  );
}

export default function App({ Component, pageProps }: AppProps) {
  const [state, setState] = useState<AuthState>('checking');

  useEffect(() => {
    if (!supabase) {
      setState('signed_out');
      return;
    }

    let active = true;
    const resolveSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      const user = data.session?.user;
      if (!user) {
        setState('signed_out');
        return;
      }
      setState('checking_role');
      const allowed = await hasActiveAdminRole(user.id);
      if (!active) return;
      if (!allowed) {
        await supabase.auth.signOut();
        setState('forbidden');
        return;
      }
      setState('allowed');
    };

    void resolveSession();
    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      void resolveSession();
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  if (state === 'checking' || state === 'checking_role') {
    return <main style={pageStyle}><LiveMarker /><div style={{ color: '#fff' }}>Vérification de la session…</div></main>;
  }

  if (state !== 'allowed') {
    return <AdminLogin onAuthenticated={() => setState('allowed')} />;
  }

  return <><LiveMarker /><Component {...pageProps} /></>;
}

const pageStyle = { minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#09070f', color: '#fff', padding: 24 } as const;
const cardStyle = { width: '100%', maxWidth: 420, background: '#151021', border: '1px solid #2c2340', borderRadius: 24, padding: 28, boxSizing: 'border-box' as const };
const brandStyle = { fontSize: 13, color: '#a78bfa', fontWeight: 800, letterSpacing: 1.4 } as const;
const titleStyle = { margin: '8px 0 6px', fontSize: 30 } as const;
const mutedStyle = { margin: '0 0 24px', color: '#a9a2b7', lineHeight: 1.5 } as const;
const labelStyle = { display: 'block', margin: '14px 0 8px', fontWeight: 700 } as const;
const inputStyle = { width: '100%', boxSizing: 'border-box' as const, padding: 14, borderRadius: 12, border: '1px solid #3b3150', background: '#0d0a13', color: '#fff', fontSize: 16 };
const buttonStyle = { width: '100%', marginTop: 20, padding: 14, border: 0, borderRadius: 999, background: '#7c3aed', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer' } as const;
const secondaryButtonStyle = { width: '100%', marginTop: 10, padding: 12, border: '1px solid #3b3150', borderRadius: 999, background: 'transparent', color: '#c4b5fd', fontSize: 14, fontWeight: 700, cursor: 'pointer' } as const;
