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
              <div style="display:inline-block;background:#e5f266;color:#15110b;border-radius:999px;padding:8px 15px;font-size:12px;font-weight:900;letter-spacing:1.7px;">Loki</div>
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
        <p style="margin:16px 0 0;font-size:11px;line-height:16px;color:#72697e;text-align:center;">Loki · Ton univers musical, gardé au même endroit.</p>
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
