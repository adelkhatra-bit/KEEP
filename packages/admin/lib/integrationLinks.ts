// Adel (08/09/2026) : "un bouton ... pour que j'active et ça me dirige
// directement sur le mode de paiement, il ne me reste plus que ça à faire"
// -- un raccourci direct vers la bonne page du bon fournisseur pour chaque
// clé d'intégration, pour ne jamais avoir à la chercher soi-même. Seule
// source de vérité, partagée entre operations.tsx (tableau "recharge/compte")
// et integrations.tsx (formulaire où on colle la clé).
//
// Important à comprendre : ce lien ouvre la bonne page, il ne "connecte"
// rien tout seul. Apple Developer Program, Spotify Developer Dashboard,
// Paddle... exigent tous une inscription/vérification manuelle par Adel
// (identité, coordonnées bancaires/fiscales) qu'aucun outil tiers ne peut
// faire à sa place -- seule la RECHERCHE de la bonne page est automatisée.
export const INTEGRATION_PROVIDER_LINKS: Record<string, { label: string; url: string }> = {
  BREVO_API_KEY: { label: 'Brevo — clé API', url: 'https://app.brevo.com/settings/keys/api' },
  BREVO_SMTP_KEY: { label: 'Brevo — clé SMTP', url: 'https://app.brevo.com/settings/keys/smtp' },
  BREVO_SMTP_LOGIN: { label: 'Brevo — clé SMTP', url: 'https://app.brevo.com/settings/keys/smtp' },
  BREVO_SENDER_EMAIL: { label: 'Brevo — expéditeurs vérifiés', url: 'https://app.brevo.com/senders/list' },
  BREVO_SENDER_NAME: { label: 'Brevo — expéditeurs vérifiés', url: 'https://app.brevo.com/senders/list' },
  AUDD_API_KEY: { label: 'AudD — recharger / abonnement', url: 'https://dashboard.audd.io/' },
  ACRCLOUD_ACCESS_KEY: { label: 'ACRCloud — console / facturation', url: 'https://console.acrcloud.com/' },
  ACRCLOUD_ACCESS_SECRET: { label: 'ACRCloud — console / facturation', url: 'https://console.acrcloud.com/' },
  ACRCLOUD_HOST: { label: 'ACRCloud — console / facturation', url: 'https://console.acrcloud.com/' },
  SPOTIFY_CLIENT_ID: { label: 'Spotify Developer Dashboard', url: 'https://developer.spotify.com/dashboard' },
  SPOTIFY_CLIENT_SECRET: { label: 'Spotify Developer Dashboard', url: 'https://developer.spotify.com/dashboard' },
  DEEZER_APP_ID: { label: 'Deezer Developers', url: 'https://developers.deezer.com/myapps' },
  DEEZER_APP_SECRET: { label: 'Deezer Developers', url: 'https://developers.deezer.com/myapps' },
  YOUTUBE_API_KEY: { label: 'Google Cloud Console — API YouTube', url: 'https://console.cloud.google.com/apis/credentials' },
  APPLE_MUSICKIT_TEAM_ID: { label: 'Apple Developer', url: 'https://developer.apple.com/account/' },
  APPLE_MUSICKIT_KEY_ID: { label: 'Apple Developer — clés MusicKit', url: 'https://developer.apple.com/account/resources/authkeys/list' },
  APPLE_MUSICKIT_PRIVATE_KEY: { label: 'Apple Developer — clés MusicKit', url: 'https://developer.apple.com/account/resources/authkeys/list' },
  MUSICAPI_CLIENT_ID: { label: 'MusicAPI Dashboard', url: 'https://app.musicapi.com/' },
  MUSICAPI_CLIENT_SECRET: { label: 'MusicAPI Dashboard', url: 'https://app.musicapi.com/' },
  PIPEDREAM_CLIENT_ID: { label: 'Pipedream API Settings', url: 'https://pipedream.com/settings/api' },
  PIPEDREAM_CLIENT_SECRET: { label: 'Pipedream API Settings', url: 'https://pipedream.com/settings/api' },
  PIPEDREAM_PROJECT_ID: { label: 'Pipedream Projects', url: 'https://pipedream.com/projects' },
  PIPEDREAM_ENVIRONMENT: { label: 'Pipedream Projects', url: 'https://pipedream.com/projects' },
  // Adel (04/09/2026 puis 08/09/2026) : App Store / Google Play — inscription
  // aux programmes développeur, jamais automatisable de bout en bout (Apple
  // exige une vérification d'identité/entreprise qui peut prendre 24-48h).
  APPLE_IAP_ISSUER_ID: { label: 'App Store Connect — clés API', url: 'https://appstoreconnect.apple.com/access/integrations/api' },
  APPLE_IAP_KEY_ID: { label: 'App Store Connect — clés API', url: 'https://appstoreconnect.apple.com/access/integrations/api' },
  APPLE_IAP_PRIVATE_KEY: { label: 'App Store Connect — clés API', url: 'https://appstoreconnect.apple.com/access/integrations/api' },
  GOOGLE_PLAY_PACKAGE_NAME: { label: 'Google Play Console', url: 'https://play.google.com/console/' },
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: { label: 'Google Play Console — API', url: 'https://play.google.com/console/api-access' },
  STRIPE_SECRET_KEY: { label: 'Stripe Dashboard — clés API', url: 'https://dashboard.stripe.com/apikeys' },
  STRIPE_WEBHOOK_SECRET: { label: 'Stripe Dashboard — webhooks', url: 'https://dashboard.stripe.com/webhooks' },
  // Adel (08/09/2026) : Paddle choisi comme merchant of record (pas de
  // société requise à Dubaï) -- voir supabase/functions/keep-paddle-webhook.
  PADDLE_SELLER_ID: { label: 'Paddle — infos vendeur', url: 'https://vendors.paddle.com/authentication' },
  PADDLE_CLIENT_TOKEN: { label: 'Paddle — Client-side Tokens', url: 'https://vendors.paddle.com/authentication' },
  PADDLE_API_KEY: { label: 'Paddle — clés API', url: 'https://vendors.paddle.com/authentication' },
  PADDLE_WEBHOOK_SECRET: { label: 'Paddle — webhooks', url: 'https://vendors.paddle.com/notifications' },
};
