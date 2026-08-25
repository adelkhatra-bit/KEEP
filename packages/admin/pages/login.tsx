import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    // _app.tsx affiche la porte de connexion tant que la session demo n'existe pas.
    // Une fois connecte, cette route renvoie vers le dashboard.
    void router.replace('/');
  }, [router]);

  return null;
}
