import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/users', label: 'Utilisateurs' },
  { href: '/plans', label: 'Abonnements & Prix' },
  { href: '/costs', label: 'Coûts & Rentabilité' },
  { href: '/feature-flags', label: 'Feature Flags' },
  { href: '/recognition', label: 'Reconnaissance' },
];

/**
 * Coquille du Super Admin. Auth réelle branchée le 24/08/2026 (demande
 * explicite -- gap trouvé en audit : cet écran avertissait depuis le début
 * "Authentification non branchée" sans qu'aucune page de connexion
 * n'existe pour la brancher, voir pages/login.tsx). Redirige vers /login
 * si aucune session Supabase active -- jamais un accès "ouvert" à cette
 * interface, même en Mode Démo (le Mode Démo ne dispense QUE de données
 * réelles, jamais de l'authentification elle-même).
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState<{ email?: string } | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setChecking(false);
      return;
    }
    // `router.replace()` peut silencieusement ne rien faire si appelé avant
    // que le router Next.js soit prêt (piège connu, constaté en direct le
    // 24/08/2026 -- l'écran restait bloqué sur "Vérification..." sans
    // jamais rediriger). `window.location.href` est un redirect dur, jamais
    // silencieusement ignoré.
    //
    // Garde-fou supplémentaire : `getSession()` s'appuie sur `navigator.locks`
    // en interne (supabase-js v2) -- si cette API se bloque pour une raison
    // d'environnement (constaté en test le 24/08/2026, cause non confirmée),
    // l'écran ne doit JAMAIS rester bloqué indéfiniment sur "Vérification...".
    // Après 5s sans réponse, on suppose "pas de session" et on redirige --
    // un faux redirect vers /login (alors qu'une session existait) coûte un
    // clic de reconnexion, jamais un écran mort.
    const timeout = setTimeout(() => {
      console.warn('[KEEP][admin-auth] getSession() sans réponse après 5s -- redirection de sécurité vers /login');
      window.location.href = '/login';
    }, 5000);
    supabase.auth.getSession().then(({ data }) => {
      clearTimeout(timeout);
      if (!data.session) {
        window.location.href = '/login';
        return;
      }
      setSession({ email: data.session.user.email ?? undefined });
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (!sess) window.location.href = '/login';
      else setSession({ email: sess.user.email ?? undefined });
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  const handleSignOut = async () => {
    await supabase?.auth.signOut();
    window.location.href = '/login';
  };

  if (isSupabaseConfigured && checking) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        Vérification de la session…
      </div>
    );
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">KEEP</div>
        <div className="subtitle">Super Admin</div>
        <nav>
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={router.pathname === item.href ? 'active' : ''}>
              {item.label}
            </Link>
          ))}
        </nav>
        {session && (
          <div style={{ marginTop: 24, fontSize: 12, color: 'var(--text-muted)' }}>
            <div style={{ marginBottom: 6 }}>Connecté : {session.email}</div>
            <button
              onClick={handleSignOut}
              style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}
            >
              Se déconnecter
            </button>
          </div>
        )}
        {!isSupabaseConfigured && (
          <div
            style={{
              marginTop: 24,
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(255,92,114,0.1)',
              border: '1px solid var(--pass)',
              color: 'var(--pass)',
              fontSize: 11,
              lineHeight: 1.4,
            }}
          >
            🔓 Supabase non configuré -- authentification impossible, accès non protégé. Ne jamais déployer cette
            interface sur une URL publique dans cet état.
          </div>
        )}
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
