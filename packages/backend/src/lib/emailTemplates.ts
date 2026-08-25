/**
 * Templates email KEEP (cf. demande explicite du 24/08/2026 -- "fais-moi une
 * belle jaquette pour l'email... avec le code couleur respecté"). Palette
 * identique à packages/mobile/src/theme/colors.ts (fond sombre #0B0A12,
 * violet KEEP #7C5CFC, turquoise #2DE1C2) -- même identité visuelle que
 * l'app, pas une charte email inventée séparément.
 *
 * HTML "table-based" + styles inline volontairement (pas de <style> ni de
 * CSS moderne) : la plupart des clients email (Gmail, Outlook...) ignorent
 * ou cassent le CSS externe/moderne -- c'est la norme du secteur pour un
 * rendu fiable partout, pas une régression technique.
 *
 * Pas encore branché à un envoi réel (voir BREVO_API_KEY dans .env --
 * bloqué le 24/08/2026 par la liste d'IP autorisées Brevo, action requise
 * côté Adel). Ce fichier prépare le contenu, prêt à être envoyé dès que
 * l'envoi réel sera débloqué.
 */

const COLORS = {
  background: '#0B0A12',
  card: '#1C1930',
  border: '#2A2640',
  primary: '#7C5CFC',
  primaryDark: '#5B3FE0',
  keep: '#2DE1C2',
  textPrimary: '#F5F3FF',
  textSecondary: '#B4AFCB',
};

function emailShell(bodyHtml: string, preheader: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>KEEP</title>
</head>
<body style="margin:0; padding:0; background-color:${COLORS.background}; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.background};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background-color:${COLORS.card}; border:1px solid ${COLORS.border}; border-radius:20px; overflow:hidden;">
          <tr>
            <td align="center" style="padding:36px 32px 8px 32px;">
              <span style="font-size:26px; font-weight:800; letter-spacing:1px; color:${COLORS.textPrimary};">KEEP</span>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 36px 32px; color:${COLORS.textSecondary}; font-size:15px; line-height:1.6;">
              ${bodyHtml}
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
          <tr>
            <td align="center" style="padding:20px 8px; color:#7A7594; font-size:12px; line-height:1.6;">
              KEEP — la mémoire musicale de tes moments.<br />
              Tu reçois cet email parce qu'une action liée à ton compte KEEP l'a déclenché.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td align="center" style="border-radius:999px; background:linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark}); background-color:${COLORS.primary};">
        <a href="${url}" target="_blank" style="display:inline-block; padding:14px 32px; color:#FFFFFF; font-weight:700; font-size:15px; text-decoration:none; border-radius:999px;">${label}</a>
      </td>
    </tr>
  </table>`;
}

/** Invitation d'un ami (cf. demande explicite du 24/08/2026 -- "partager un lien pour qu'un ami s'inscrive"). */
export function inviteEmail(opts: { inviterName: string; signupUrl: string }): { subject: string; html: string } {
  const body = `
    <p style="color:${COLORS.textPrimary}; font-size:18px; font-weight:700; margin:0 0 12px 0;">
      ${opts.inviterName} t'invite sur KEEP
    </p>
    <p style="margin:0 0 4px 0;">
      KEEP identifie la musique que tu entends (TikTok, soirée, voiture, radio...) et la garde dans ton univers musical, connecté à Spotify, Apple Music et YouTube.
    </p>
    <p style="margin:16px 0 0 0;">Rejoins ${opts.inviterName} et commence à garder ta musique :</p>
    ${ctaButton(opts.signupUrl, 'Rejoindre KEEP')}
    <p style="font-size:12px; color:#7A7594; margin:8px 0 0 0;">Si le bouton ne fonctionne pas, copie ce lien : <span style="color:${COLORS.keep};">${opts.signupUrl}</span></p>
  `;
  return {
    subject: `${opts.inviterName} t'invite sur KEEP`,
    html: emailShell(body, `${opts.inviterName} t'invite à découvrir KEEP.`),
  };
}

/** Lien de connexion (magic link) -- même identité visuelle que le reste. */
export function magicLinkEmail(opts: { signinUrl: string }): { subject: string; html: string } {
  const body = `
    <p style="color:${COLORS.textPrimary}; font-size:18px; font-weight:700; margin:0 0 12px 0;">
      Ton lien de connexion KEEP
    </p>
    <p style="margin:0;">Clique sur le bouton ci-dessous pour te connecter. Ce lien expire rapidement et ne peut servir qu'une fois.</p>
    ${ctaButton(opts.signinUrl, 'Se connecter à KEEP')}
    <p style="font-size:12px; color:#7A7594; margin:8px 0 0 0;">Si tu n'as pas demandé ce lien, ignore cet email en toute sécurité.</p>
  `;
  return {
    subject: 'Ton lien de connexion KEEP',
    html: emailShell(body, 'Ton lien de connexion KEEP.'),
  };
}

/**
 * Code de confirmation KEEP (cf. demande explicite du 24/08/2026 -- "je viens
 * de démontrer que le vrai email reçu n'utilise pas notre template" +
 * "l'interface demande un CODE... incohérent avec l'email qui envoie un
 * LIEN"). Choix : OTP conservé (déjà le flux client réel, verifyOtp() côté
 * mobile) -- un lien magique a un vrai problème connu sur PWA/web mobile
 * (ouverture dans un autre onglet/navigateur que celui où l'utilisateur a
 * commencé, perte du contexte app) -- un code à taper n'a pas ce problème et
 * fonctionne identiquement iPhone Safari/Android/futur natif. Donc PAS de
 * bouton/lien ici, uniquement le code, en évidence.
 */
export function confirmationCodeEmail(opts: { code: string }): { subject: string; html: string } {
  const body = `
    <p style="color:${COLORS.textPrimary}; font-size:18px; font-weight:700; margin:0 0 12px 0;">
      Bienvenue sur KEEP
    </p>
    <p style="margin:0 0 20px 0;">
      Confirme ton adresse e-mail pour activer ton profil et continuer à garder, ranger et partager tes découvertes musicales.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
      <tr>
        <td style="background-color:${COLORS.background}; border:1px solid ${COLORS.border}; border-radius:14px; padding:18px 28px;">
          <span style="font-size:32px; font-weight:800; letter-spacing:8px; color:${COLORS.keep};">${opts.code}</span>
        </td>
      </tr>
    </table>
    <p style="font-size:12px; color:#7A7594; margin:0;">Si tu n'es pas à l'origine de cette inscription, ignore simplement cet e-mail.</p>
    <p style="font-size:13px; color:${COLORS.textSecondary}; margin:20px 0 0 0; font-style:italic;">KEEP. Tu l'aimes. KEEP la range.</p>
  `;
  return {
    subject: 'Confirme ton adresse e-mail — KEEP',
    html: emailShell(body, `Ton code KEEP : ${opts.code}`),
  };
}

/** Confirmation qu'un ami a "gardé" un morceau partagé depuis ton profil (cf. demande explicite du 24/08/2026 -- notifications). */
export function trackKeptFromYouEmail(opts: { viewerName: string; trackTitle: string; trackArtist: string; profileUrl: string }): { subject: string; html: string } {
  const body = `
    <p style="color:${COLORS.textPrimary}; font-size:18px; font-weight:700; margin:0 0 12px 0;">
      ${opts.viewerName} a gardé un morceau grâce à toi
    </p>
    <p style="margin:0;">
      <span style="color:${COLORS.keep}; font-weight:600;">${opts.trackTitle}</span> — ${opts.trackArtist}
    </p>
    <p style="margin:16px 0 0 0;">${opts.viewerName} a découvert ce morceau sur ton profil KEEP et l'a ajouté au sien.</p>
    ${ctaButton(opts.profileUrl, 'Voir mon profil')}
  `;
  return {
    subject: `${opts.viewerName} a gardé un morceau grâce à toi`,
    html: emailShell(body, `${opts.viewerName} a gardé ${opts.trackTitle} grâce à ton profil KEEP.`),
  };
}
