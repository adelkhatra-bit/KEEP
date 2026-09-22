// Adel (16-17/09/2026) : "ce n'est pas le design ... pourquoi on n'a pas le
// design de Loki par email" -- l'email de test Brevo (Super Admin >
// Intégrations) utilisait un gabarit minimal différent des vrais emails de
// production (récupération de mot de passe, code de vérification), qui eux
// utilisent bien ce même habillage sombre + pastille "Loki" + jaune-citron
// de marque. Un seul gabarit partagé désormais, pour ne plus jamais diverger.
export function lokiEmailShell(title: string, heading: string, bodyHtml: string, footer: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#09070d;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#09070d;margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:24px 14px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;background:#14101b;border:1px solid #2b2235;border-radius:28px;overflow:hidden;">
          <tr>
            <td style="padding:30px 26px 12px;text-align:center;">
              <div style="display:inline-block;background:#e5f266;color:#15110b;border-radius:999px;padding:8px 15px;font-size:12px;font-weight:900;letter-spacing:1.7px;">Loki Music</div>
              <h1 style="margin:22px 0 8px;font-size:27px;line-height:32px;font-weight:900;color:#ffffff;">${escapeHtml(heading)}</h1>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 24px 8px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 26px 30px;">
              <div style="height:1px;background:#2b2235;margin-bottom:20px;"></div>
              <p style="margin:0;font-size:12px;line-height:18px;color:#90869d;text-align:center;">${footer}</p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:11px;line-height:16px;color:#72697e;text-align:center;">Loki Music · Ton univers musical, gardé au même endroit.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Audit Adel (22/09/2026, Bloc 4 B1) : "Unifier : une seule source de
// verite pour le template e-mail. Supprime les duplications." -- ce
// gabarit (titre + intro + bouton CTA unique + lien en clair) etait
// copie-colle a l'IDENTIQUE dans keep-auth-email/index.ts (confirmation
// d'inscription, mot de passe oublie) ET keep-admin-control/index.ts
// (envoi de test Super Admin), sous le nom local `shellHtml`. Deplace ici,
// source unique -- les deux fonctions importent desormais celle-ci.
export function lokiEmailCtaShell(title: string, heading: string, intro: string, buttonLabel: string, link: string, footer: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#09070d;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#09070d;margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:24px 14px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;background:#14101b;border:1px solid #2b2235;border-radius:28px;overflow:hidden;">
          <tr>
            <td style="padding:30px 26px 12px;text-align:center;">
              <div style="display:inline-block;background:#e5f266;color:#15110b;border-radius:999px;padding:8px 15px;font-size:12px;font-weight:900;letter-spacing:1.7px;">Loki Music</div>
              <h1 style="margin:22px 0 8px;font-size:27px;line-height:32px;font-weight:900;color:#ffffff;">${escapeHtml(heading)}</h1>
              <p style="margin:0 auto;max-width:410px;font-size:15px;line-height:22px;color:#cfc7d8;">${intro}</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:14px 24px 26px;">
              <a href="${link}" style="display:inline-block;background:#e5f266;color:#15110b;font-weight:900;font-size:15px;text-decoration:none;border-radius:999px;padding:15px 34px;">${escapeHtml(buttonLabel)}</a>
              <p style="margin:18px 0 0;font-size:11px;line-height:16px;color:#72697e;word-break:break-all;">${escapeHtml(link)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:6px 26px 30px;">
              <div style="height:1px;background:#2b2235;margin-bottom:20px;"></div>
              <p style="margin:0;font-size:12px;line-height:18px;color:#90869d;text-align:center;">${footer}</p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:11px;line-height:16px;color:#72697e;text-align:center;">Loki Music · Ton univers musical, gardé au même endroit.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Meme unification (Bloc 4 B1) pour le gabarit "code a 6 chiffres" --
// deplace depuis keep-account-email/index.ts (`verificationEmailHtml`),
// seule fonction a utiliser ce troisieme agencement (pastille de code au
// lieu d'un bouton).
export function lokiEmailCodeShell(title: string, heading: string, intro: string, code: string, footer: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#09070d;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#09070d;margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:24px 14px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;background:#14101b;border:1px solid #2b2235;border-radius:28px;overflow:hidden;">
          <tr>
            <td style="padding:30px 26px 12px;text-align:center;">
              <div style="display:inline-block;background:#e5f266;color:#15110b;border-radius:999px;padding:8px 15px;font-size:12px;font-weight:900;letter-spacing:1.7px;">Loki Music</div>
              <h1 style="margin:22px 0 8px;font-size:27px;line-height:32px;font-weight:900;color:#ffffff;">${escapeHtml(heading)}</h1>
              <p style="margin:0 auto;max-width:410px;font-size:15px;line-height:22px;color:#cfc7d8;">${intro}</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:22px 24px 8px;">
              <div style="box-sizing:border-box;width:100%;max-width:360px;background:#09070d;border:1px solid #463653;border-radius:22px;padding:22px 12px;font-size:34px;line-height:40px;font-weight:900;letter-spacing:9px;color:#e5f266;text-align:center;">${escapeHtml(code)}</div>
              <p style="margin:12px 0 0;font-size:13px;line-height:19px;color:#a99eb5;">Ce code expire dans <strong style="color:#ffffff">10 minutes</strong>.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 26px 30px;">
              <div style="height:1px;background:#2b2235;margin-bottom:20px;"></div>
              <p style="margin:0;font-size:12px;line-height:18px;color:#90869d;text-align:center;">${footer}</p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:11px;line-height:16px;color:#72697e;text-align:center;">Loki Music · Ton univers musical, gardé au même endroit.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
