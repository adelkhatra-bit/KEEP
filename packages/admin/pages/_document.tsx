import { Html, Head, Main, NextScript } from 'next/document';

// Langue française déclarée (07/10/2026) : lecteurs d'écran en français et coupure propre des mots longs (« CERTIFICA-TION »).
export default function Document() {
  return (
    <Html lang="fr">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
