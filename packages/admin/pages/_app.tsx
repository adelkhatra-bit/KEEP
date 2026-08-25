import type { AppProps } from 'next/app';
import { FormEvent, useEffect, useState } from 'react';
import '../styles/globals.css';

const DEMO_EMAIL = 'adel.khatra@live.fr';
const DEMO_PASSWORD = '1234';
const DEMO_SESSION_KEY = 'keep-super-admin-demo';

function LiveMarker() {
  return (
    <div style={{ position: 'fixed', top: 10, right: 10, zIndex: 99999, background: '#22c55e', color: '#07110a', borderRadius: 999, padding: '7px 11px', fontSize: 11, fontWeight: 900, letterSpacing: 0.7, boxShadow: '0 4px 18px rgba(34,197,94,.28)' }}>
      KEEP LIVE · MAIN · 25/08/2026
    </div>
  );
}

function DemoAdminLogin({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD) {
      sessionStorage.setItem(DEMO_SESSION_KEY, '1');
      setError('');
      onAuthenticated();
      return;
    }
    setError('Identifiants démo incorrects.');
  };

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#09070f', color: '#fff', padding: 24 }}>
      <LiveMarker />
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 420, background: '#151021', border: '1px solid #2c2340', borderRadius: 24, padding: 28 }}>
        <div style={{ fontSize: 13, color: '#a78bfa', fontWeight: 700, letterSpacing: 1.2 }}>KEEP</div>
        <h1 style={{ margin: '8px 0 4px', fontSize: 30 }}>Super Admin</h1>
        <p style={{ margin: '0 0 24px', color: '#a9a2b7' }}>Accès de démonstration uniquement — jamais utilisé comme authentification production.</p>
        <label style={{ display: 'block', marginBottom: 8 }}>E-mail</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" style={{ width: '100%', boxSizing: 'border-box', padding: 14, borderRadius: 12, border: '1px solid #3b3150', background: '#0d0a13', color: '#fff', fontSize: 16, marginBottom: 16 }} />
        <label style={{ display: 'block', marginBottom: 8 }}>Mot de passe démo</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" style={{ width: '100%', boxSizing: 'border-box', padding: 14, borderRadius: 12, border: '1px solid #3b3150', background: '#0d0a13', color: '#fff', fontSize: 16 }} />
        {error && <p style={{ color: '#fb7185', marginBottom: 0 }}>{error}</p>}
        <button type="submit" style={{ width: '100%', marginTop: 20, padding: 14, border: 0, borderRadius: 999, background: '#7c3aed', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>Se connecter</button>
        <div style={{ marginTop: 18, padding: 12, borderRadius: 12, background: '#0d0a13', color: '#b8b0c7', fontSize: 13 }}>
          Démo : {DEMO_EMAIL} / 1234
        </div>
      </form>
    </main>
  );
}

export default function App({ Component, pageProps }: AppProps) {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    setAuthenticated(sessionStorage.getItem(DEMO_SESSION_KEY) === '1');
    setReady(true);
  }, []);

  if (!ready) return null;
  if (!authenticated) return <DemoAdminLogin onAuthenticated={() => setAuthenticated(true)} />;
  return <><LiveMarker /><Component {...pageProps} /></>;
}
