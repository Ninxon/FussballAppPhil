// Geteiltes Email-Layout für alle Edge Functions, die Mails versenden.
// Wir nutzen klassisches table-basiertes Markup mit Inline-Styles —
// das ist die einzige Variante, die Outlook, Gmail Web, Apple Mail
// und mobile Clients zuverlässig identisch rendern.

export const LOGO_URL =
  'https://mgdrbgtsaqhgrdsnpasv.supabase.co/storage/v1/object/public/branding/logo.png';

export const BRAND_NAME = 'PK Fussballschule';
export const FROM_HEADER = `"PK Fussballschule" <${Deno.env.get('GMAIL_USER') ?? ''}>`;

export const BRAND_COLORS = {
  navy: '#152238',
  navyMuted: '#1F2D47',
  bg: '#EEF3FB',
  bgCard: '#F8FAFD',
  text: '#152238',
  textMuted: '#5A6A82',
  textSubtle: '#8A98AC',
  divider: '#E5ECF5',
  accentBlue: '#4A8FE8',
  accentGreen: '#5A8C6A',
  accentRed: '#C0392B',
  accentOrange: '#E67E22',
  white: '#FFFFFF',
} as const;

export type EmailRow = { label: string; value: string };

export type EmailLayoutInput = {
  title: string;                // z.B. „Buchungsbestätigung"
  accentColor: string;          // hex, färbt Header-Akzent + Greeting
  preheader?: string;           // unsichtbarer Vorschautext im Inbox-Preview
  greeting: string;             // z.B. „Hallo Max,"
  intro: string;                // einleitender Satz/Paragraph
  rows: EmailRow[];             // Details-Tabelle
  outro?: string;               // optionaler Absatz vor der Signatur
  signOff: string;              // z.B. „Wir freuen uns auf dich!"
};

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderEmailLayout(input: EmailLayoutInput): string {
  const rowsHtml = input.rows
    .map(
      (r) => `
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid ${BRAND_COLORS.divider};color:${BRAND_COLORS.textMuted};font-size:13px;font-weight:500;width:38%;vertical-align:top">${escapeHtml(r.label)}</td>
              <td style="padding:10px 0;border-bottom:1px solid ${BRAND_COLORS.divider};color:${BRAND_COLORS.text};font-size:14px;font-weight:600;vertical-align:top">${escapeHtml(r.value)}</td>
            </tr>`,
    )
    .join('');

  const preheader = input.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(input.preheader)}</div>`
    : '';

  const outroBlock = input.outro
    ? `<p style="margin:20px 0 0 0;color:${BRAND_COLORS.text};font-size:15px;line-height:1.55">${escapeHtml(input.outro)}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND_COLORS.bg};font-family:${FONT_STACK}">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND_COLORS.bg};padding:32px 12px">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${BRAND_COLORS.white};border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(21,34,56,0.06)">

        <!-- Header -->
        <tr>
          <td style="background:${BRAND_COLORS.navy};padding:24px 32px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:middle">
                  <img src="${LOGO_URL}" alt="${escapeHtml(BRAND_NAME)}" width="44" height="44" style="display:block;border-radius:8px;background:${BRAND_COLORS.white}">
                </td>
                <td style="vertical-align:middle;padding-left:14px">
                  <div style="color:${BRAND_COLORS.white};font-size:16px;font-weight:700;letter-spacing:0.3px">${escapeHtml(BRAND_NAME)}</div>
                  <div style="color:rgba(255,255,255,0.55);font-size:12px;margin-top:2px;letter-spacing:0.4px;text-transform:uppercase">${escapeHtml(input.title)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Akzent-Streifen -->
        <tr><td style="height:4px;background:${input.accentColor};line-height:4px;font-size:0">&nbsp;</td></tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px">
            <div style="color:${input.accentColor};font-size:20px;font-weight:700;margin:0 0 8px 0">${escapeHtml(input.greeting)}</div>
            <p style="margin:0;color:${BRAND_COLORS.text};font-size:15px;line-height:1.55">${escapeHtml(input.intro)}</p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;background:${BRAND_COLORS.bgCard};border-radius:12px;padding:8px 20px">
              ${rowsHtml}
            </table>

            ${outroBlock}

            <p style="margin:28px 0 0 0;color:${BRAND_COLORS.textMuted};font-size:14px;line-height:1.5">
              ${escapeHtml(input.signOff)}<br>
              <span style="color:${BRAND_COLORS.text};font-weight:600">Dein ${escapeHtml(BRAND_NAME)} Team</span>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:${BRAND_COLORS.bgCard};padding:20px 32px;border-top:1px solid ${BRAND_COLORS.divider}">
            <div style="color:${BRAND_COLORS.textSubtle};font-size:11px;line-height:1.5;text-align:center">
              ${escapeHtml(BRAND_NAME)} · Diese Nachricht wurde automatisch versendet.<br>
              Bei Fragen antworte einfach auf diese E-Mail.
            </div>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
