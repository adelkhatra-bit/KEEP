/**
 * Génération de la page HTML MusicKit JS et parsing des messages WebView
 * pour le flux d'autorisation Apple Music (voir appleMusicAuth.ts pour le
 * contexte complet et le pourquoi de cette approche WebView).
 *
 * Séparé de appleMusicAuth.ts volontairement : ce fichier ne dépend
 * d'aucun module React Native/Expo (zéro import), ce qui le rend
 * exécutable et testable directement avec `tsx`, comme packages/music --
 * cohérent avec la règle "jamais de test qu'on ne peut pas réellement
 * exécuter" de ce projet.
 */

export function buildAppleMusicAuthHtml(developerToken: string): string {
  // JSON.stringify échappe correctement les guillemets/caractères spéciaux
  // du token pour une injection sûre dans le <script>.
  const safeToken = JSON.stringify(developerToken);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="apple-music-developer-token" content=${safeToken} />
  <script src="https://js-cdn.music.apple.com/musickit/v3/musickit.js"></script>
</head>
<body style="background:#0B0A12;color:#F5F3FF;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <p id="status">Connexion à Apple Music…</p>
  <script>
    function post(payload) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    }
    document.addEventListener('musickitloaded', async function () {
      try {
        await MusicKit.configure({
          developerToken: ${safeToken},
          app: { name: 'KEEP', build: '1.0.0' },
        });
        const music = MusicKit.getInstance();
        const musicUserToken = await music.authorize();
        document.getElementById('status').textContent = 'Connecté.';
        post({ type: 'success', musicUserToken });
      } catch (err) {
        document.getElementById('status').textContent = 'Échec de connexion.';
        post({ type: 'error', message: (err && err.message) || String(err) });
      }
    });
  </script>
</body>
</html>`;
}

export interface AppleMusicAuthMessage {
  type: 'success' | 'error';
  musicUserToken?: string;
  message?: string;
}

export function parseAppleMusicAuthMessage(raw: string): AppleMusicAuthMessage {
  const parsed = JSON.parse(raw);
  if (parsed.type !== 'success' && parsed.type !== 'error') {
    throw new Error('Message WebView Apple Music inattendu.');
  }
  return parsed;
}
