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
export type IntegrationProviderLink = {
  label: string;
  url: string;
  help: string;
  expected?: string;
  fixedValue?: string;
};

export const INTEGRATION_PROVIDER_LINKS: Record<string, IntegrationProviderLink> = {
  RESEND_API_KEY: { label: 'Resend — clé API', url: 'https://resend.com/api-keys', help: 'Ouvre Resend > API Keys, crée ou copie une clé serveur puis colle-la ici.', expected: 'Commence généralement par re_…' },
  EMAIL_SENDER_ADDRESS: { label: 'Resend — domaines / expéditeurs', url: 'https://resend.com/domains', help: 'Ouvre Resend > Domains. Utilise une adresse appartenant à un domaine vérifié.', expected: 'Exemple : contact@ton-domaine.com' },
  BREVO_API_KEY: { label: 'Brevo — clé API', url: 'https://app.brevo.com/settings/keys/api', help: 'Ouvre Brevo > SMTP & API > API Keys. Crée ou copie la clé API v3.', expected: 'Clé API Brevo complète' },
  BREVO_SMTP_KEY: { label: 'Brevo — clé SMTP', url: 'https://app.brevo.com/settings/keys/smtp', help: 'Ouvre Brevo > SMTP & API > SMTP. Copie la clé SMTP, pas la clé API.', expected: 'Clé SMTP Brevo complète' },
  BREVO_SMTP_LOGIN: { label: 'Brevo — identifiant SMTP', url: 'https://app.brevo.com/settings/keys/smtp', help: 'Ouvre Brevo > SMTP & API > SMTP et copie le Login SMTP affiché.', expected: 'Souvent une adresse e-mail ou un identifiant SMTP' },
  BREVO_SENDER_EMAIL: { label: 'Brevo — expéditeurs vérifiés', url: 'https://app.brevo.com/senders/list', help: 'Ouvre Brevo > Senders. Copie l’adresse d’un expéditeur déjà vérifié.', expected: 'Une adresse e-mail vérifiée' },
  BREVO_SENDER_NAME: { label: 'Brevo — nom expéditeur', url: 'https://app.brevo.com/senders/list', help: 'Nom visible par les utilisateurs dans leurs e-mails.', expected: 'Exemple : Loki Music' },
  // Adel (08/09/2026) : "une autre plate-forme d'e-mail ... gratuite ...
  // 6000 e-mails gratuit" -- Mailjet, alternative a Brevo (keep-auth-email
  // bascule dessus automatiquement des que ces deux cles sont renseignees).
  MAILJET_API_KEY: { label: 'Mailjet — clé API', url: 'https://app.mailjet.com/account/apikeys', help: 'Ouvre Mailjet > API Key Management et copie l’API Key.', expected: 'API Key Mailjet' },
  MAILJET_SECRET_KEY: { label: 'Mailjet — Secret Key', url: 'https://app.mailjet.com/account/apikeys', help: 'Sur la même page Mailjet, copie la Secret Key associée à l’API Key.', expected: 'Secret Key Mailjet' },
  AUDD_API_KEY: { label: 'AudD — API token', url: 'https://dashboard.audd.io/', help: 'Ouvre le tableau de bord AudD et copie ton API token. Loki le teste avant de l’enregistrer.', expected: 'Token AudD valide ; optionnel si ACRCloud est actif' },
  ACRCLOUD_ACCESS_KEY: { label: 'ACRCloud — projet de reconnaissance', url: 'https://console.acrcloud.com/', help: 'Ouvre ton projet ACRCloud > Audio & Video Recognition et copie Access Key.', expected: 'Access Key du même projet que le Secret et le Host' },
  ACRCLOUD_ACCESS_SECRET: { label: 'ACRCloud — projet de reconnaissance', url: 'https://console.acrcloud.com/', help: 'Dans le même projet ACRCloud, copie Access Secret.', expected: 'Access Secret du même projet' },
  ACRCLOUD_HOST: { label: 'ACRCloud — projet de reconnaissance', url: 'https://console.acrcloud.com/', help: 'Dans le même projet ACRCloud, copie l’Identify Host.', expected: 'Doit ressembler à identify-….acrcloud.com' },
  GOOGLE_TRANSLATE_API_KEY: { label: 'Google Cloud — identifiants', url: 'https://console.cloud.google.com/apis/credentials', help: 'Ouvre Google Cloud > APIs & Services > Credentials, puis copie une API Key autorisée pour Cloud Translation.', expected: 'Clé Google Cloud API' },
  SPOTIFY_CLIENT_ID: { label: 'Spotify — application Loki', url: 'https://developer.spotify.com/dashboard', help: 'Ouvre ton application Loki dans Spotify Developer Dashboard > Settings et copie Client ID.', expected: 'Client ID Spotify' },
  SPOTIFY_CLIENT_SECRET: { label: 'Spotify — application Loki', url: 'https://developer.spotify.com/dashboard', help: 'Dans la même application Spotify > Settings, affiche puis copie Client Secret.', expected: 'Client Secret Spotify' },
  DEEZER_APP_ID: { label: 'Deezer — My Apps', url: 'https://developers.deezer.com/myapps', help: 'Ouvre ton application Deezer et copie Application ID.', expected: 'App ID Deezer' },
  DEEZER_APP_SECRET: { label: 'Deezer — My Apps', url: 'https://developers.deezer.com/myapps', help: 'Dans la même application Deezer, copie Secret Key.', expected: 'App Secret Deezer' },
  YOUTUBE_API_KEY: { label: 'Google Cloud — API YouTube', url: 'https://console.cloud.google.com/apis/credentials', help: 'Ouvre Google Cloud > Credentials, copie une API Key du projet où YouTube Data API v3 est activée.', expected: 'Clé Google commençant souvent par AIza…' },
  APPLE_MUSICKIT_TEAM_ID: { label: 'Apple Developer — Membership', url: 'https://developer.apple.com/account/', help: 'Dans Apple Developer > Membership details, copie Team ID.', expected: '10 caractères alphanumériques majuscules' },
  APPLE_MUSICKIT_KEY_ID: { label: 'Apple Developer — Keys', url: 'https://developer.apple.com/account/resources/authkeys/list', help: 'Ouvre Certificates, Identifiers & Profiles > Keys et copie le Key ID de la clé MusicKit.', expected: '10 caractères alphanumériques majuscules' },
  APPLE_MUSICKIT_PRIVATE_KEY: { label: 'Apple Developer — Keys', url: 'https://developer.apple.com/account/resources/authkeys/list', help: 'Télécharge le fichier .p8 de la même clé MusicKit et colle son contenu complet.', expected: '-----BEGIN PRIVATE KEY----- … -----END PRIVATE KEY-----' },
  MUSICAPI_CLIENT_ID: { label: 'MusicAPI — Dashboard', url: 'https://app.musicapi.com/', help: 'Ouvre ton dashboard MusicAPI et copie la clé/client ID indiquée pour l’API catalogue.', expected: 'Identifiant MusicAPI valide' },
  MUSICAPI_CLIENT_SECRET: { label: 'MusicAPI — Dashboard', url: 'https://app.musicapi.com/', help: 'Copie le secret associé au client MusicAPI.', expected: 'Secret MusicAPI' },
  PIPEDREAM_CLIENT_ID: { label: 'Pipedream — API Settings', url: 'https://pipedream.com/settings/api', help: 'Ouvre Pipedream > Settings > API. Copie le Client ID de ton application / OAuth client.', expected: 'Client ID Pipedream, pas “Loki Music”' },
  PIPEDREAM_CLIENT_SECRET: { label: 'Pipedream — API Settings', url: 'https://pipedream.com/settings/api', help: 'Sur la même page Pipedream > Settings > API, copie le Client Secret associé au Client ID.', expected: 'Client Secret Pipedream' },
  PIPEDREAM_PROJECT_ID: { label: 'Pipedream — Projects', url: 'https://pipedream.com/projects', help: 'Ouvre Pipedream > Projects > ton projet Loki > Settings. Copie l’identifiant du projet.', expected: 'Doit commencer par proj_' },
  PIPEDREAM_ENVIRONMENT: { label: 'Pipedream — Environment Variables', url: 'https://pipedream.com/settings/env-vars', help: 'Pour Loki en production, ne cherche pas une valeur sur le site : utilise simplement la valeur production.', expected: 'Valeur exacte : production', fixedValue: 'production' },
  // Adel (04/09/2026 puis 08/09/2026) : App Store / Google Play — inscription
  // aux programmes développeur, jamais automatisable de bout en bout (Apple
  // exige une vérification d'identité/entreprise qui peut prendre 24-48h).
  APPLE_IAP_ISSUER_ID: { label: 'App Store Connect — API', url: 'https://appstoreconnect.apple.com/access/integrations/api', help: 'Ouvre App Store Connect > Users and Access > Integrations > App Store Connect API et copie Issuer ID.', expected: 'UUID Issuer ID Apple' },
  APPLE_IAP_KEY_ID: { label: 'App Store Connect — API', url: 'https://appstoreconnect.apple.com/access/integrations/api', help: 'Sur la même page, copie le Key ID de la clé API utilisée par Loki.', expected: '10 caractères alphanumériques majuscules' },
  APPLE_IAP_PRIVATE_KEY: { label: 'App Store Connect — API', url: 'https://appstoreconnect.apple.com/access/integrations/api', help: 'Télécharge le .p8 de cette clé API et colle son contenu complet ici.', expected: '-----BEGIN PRIVATE KEY----- … -----END PRIVATE KEY-----' },
  GOOGLE_PLAY_PACKAGE_NAME: { label: 'Google Play Console', url: 'https://play.google.com/console/', help: 'Ouvre ton application Loki dans Google Play Console et copie le nom de package.', expected: 'Exemple : com.adelkhatra.keep' },
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: { label: 'Google Play Console — API access', url: 'https://play.google.com/console/api-access', help: 'Associe un compte de service Google Cloud à Play Console, puis colle ici le JSON téléchargé complet.', expected: 'JSON service_account complet' },
  STRIPE_SECRET_KEY: { label: 'Stripe — API Keys', url: 'https://dashboard.stripe.com/apikeys', help: 'Ouvre Stripe > Developers > API keys et copie Secret key, jamais Publishable key.', expected: 'Doit commencer par sk_test_ ou sk_live_' },
  STRIPE_PUBLISHABLE_KEY: { label: 'Stripe — API Keys', url: 'https://dashboard.stripe.com/apikeys', help: 'Ouvre Stripe > Developers > API keys et copie Publishable key.', expected: 'Doit commencer par pk_test_ ou pk_live_' },
  STRIPE_WEBHOOK_SECRET: { label: 'Stripe — Webhooks', url: 'https://dashboard.stripe.com/webhooks', help: 'Ouvre le webhook Loki dans Stripe et copie Signing secret.', expected: 'Doit commencer par whsec_' },
  // Adel (08/09/2026) : Paddle choisi comme merchant of record (pas de
  // société requise à Dubaï) -- voir supabase/functions/keep-paddle-webhook.
  PADDLE_SELLER_ID: { label: 'Paddle — Authentication', url: 'https://vendors.paddle.com/authentication', help: 'Ouvre Paddle > Developer tools / Authentication et copie Seller ID.', expected: 'Seller ID Paddle' },
  PADDLE_CLIENT_TOKEN: { label: 'Paddle — Authentication', url: 'https://vendors.paddle.com/authentication', help: 'Dans Paddle, copie le Client-side Token destiné au checkout navigateur.', expected: 'Client-side Token Paddle' },
  PADDLE_API_KEY: { label: 'Paddle — Authentication', url: 'https://vendors.paddle.com/authentication', help: 'Dans Paddle, crée ou copie une API Key serveur.', expected: 'API Key Paddle serveur' },
  PADDLE_WEBHOOK_SECRET: { label: 'Paddle — Notifications', url: 'https://vendors.paddle.com/notifications', help: 'Ouvre la destination webhook Loki et copie Endpoint Secret.', expected: 'Webhook secret Paddle' },
  // Adel (20/09/2026) : relais ChatGPT <-> Claude Code (AI/AI_bridge.md).
  // La clé se génère en un clic dans ce formulaire (bouton "Générer" juste
  // à côté) ; ce lien n'ouvre que la seconde étape, qui n'a pas d'API et
  // doit rester manuelle : coller le même schéma + la même clé dans un
  // Custom GPT.
  AI_RELAY_API_KEY: { label: 'ChatGPT — Actions', url: 'https://chatgpt.com/gpts/editor', help: 'Cette clé est interne à Loki : utilise le bouton Générer ici, puis reporte la même valeur dans l’action ChatGPT.', expected: 'Générée automatiquement par le Super Admin' },
};
