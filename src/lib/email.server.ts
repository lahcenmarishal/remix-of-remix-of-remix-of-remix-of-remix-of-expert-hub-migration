/**
 * Envoi d'emails transactionnels ProFinder via Resend.
 * Domaine vérifié : profinder.ma
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export const SITE_NAME = "ProFinder";
export const FROM_EMAIL = `ProFinder <notifications@profinder.ma>`;
export const REPLY_TO = "contact@profinder.ma";
export const SITE_URL = "https://profinder.ma";

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export async function sendEmail(input: SendEmailInput): Promise<{ sent: boolean; id?: string; reason?: string }> {
  const apiKey = process.env["RESEND_SECRET"] ?? process.env["RESEND_API_KEY"];
  if (!apiKey) {
    console.error("[email] RESEND_SECRET manquant");
    return { sent: false, reason: "missing_api_key" };
  }

  const recipients = (Array.isArray(input.to) ? input.to : [input.to]).filter(Boolean);
  if (recipients.length === 0) return { sent: false, reason: "no_recipient" };

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: recipients,
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
      reply_to: input.replyTo ?? REPLY_TO,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`[email] Resend a refusé l'envoi [${response.status}]: ${body}`);
    return { sent: false, reason: `resend_error_${response.status}` };
  }

  const data = (await response.json()) as { id?: string };
  return { sent: true, ...(data.id ? { id: data.id } : {}) };
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Gabarit commun : en-tête, contenu, bouton d'action et pied de page. */
export function layout(options: {
  title: string;
  intro?: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): string {
  const cta =
    options.ctaLabel && options.ctaUrl
      ? `<tr><td style="padding:8px 32px 8px 32px;">
           <a href="${options.ctaUrl}" style="display:inline-block;background:#1f6feb;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:12px;">${escapeHtml(options.ctaLabel)}</a>
         </td></tr>`
      : "";

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(options.title)}</title></head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;">
    <tr><td align="center" style="padding:32px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border:1px solid #e5e7eb;border-radius:20px;overflow:hidden;">
        <tr><td style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">
          <span style="font-size:20px;font-weight:800;letter-spacing:-0.4px;color:#1f6feb;">ProFinder</span>
          <span style="font-size:13px;color:#6b7280;"> · cours particuliers au Maroc</span>
        </td></tr>
        <tr><td style="padding:28px 32px 8px 32px;">
          <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;font-weight:800;">${escapeHtml(options.title)}</h1>
          ${options.intro ? `<p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:#374151;">${escapeHtml(options.intro)}</p>` : ""}
          <div style="font-size:15px;line-height:1.6;color:#374151;">${options.body}</div>
        </td></tr>
        ${cta}
        <tr><td style="padding:24px 32px 28px 32px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
          Vous recevez cet email car vous avez un compte sur
          <a href="${SITE_URL}" style="color:#1f6feb;text-decoration:none;">profinder.ma</a>.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export const emailTemplates = {
  welcome: (name?: string) => ({
    subject: "Bienvenue sur ProFinder 🎓",
    html: layout({
      title: `Bienvenue${name ? ` ${escapeHtml(name)}` : ""} !`,
      intro: "Votre compte ProFinder est actif.",
      body: "<p>Vous pouvez dès maintenant publier une demande de cours ou parcourir les professeurs disponibles près de chez vous.</p>",
      ctaLabel: "Accéder à mon espace",
      ctaUrl: `${SITE_URL}/demandes`,
    }),
  }),

  newRequestForPro: (options: { requestUrl: string; direct: boolean }) => ({
    subject: options.direct
      ? "Nouvelle demande directe sur ProFinder"
      : "Une nouvelle demande correspond à votre profil",
    html: layout({
      title: options.direct ? "Un élève vous a contacté" : "Nouvelle demande pour vous",
      body: options.direct
        ? "<p>Un élève vient de vous envoyer une demande de cours directe. Répondez rapidement pour maximiser vos chances.</p>"
        : "<p>Une nouvelle demande de cours correspond à votre matière et à votre ville.</p>",
      ctaLabel: "Voir la demande",
      ctaUrl: options.requestUrl,
    }),
  }),

  proposalForClient: (options: { proName: string; requestUrl: string }) => ({
    subject: "Un professeur est intéressé par votre demande",
    html: layout({
      title: "Vous avez reçu une proposition",
      body: `<p><strong>${escapeHtml(options.proName)}</strong> souhaite vous accompagner. Consultez son profil et échangez directement avec lui.</p>`,
      ctaLabel: "Voir la proposition",
      ctaUrl: options.requestUrl,
    }),
  }),

  newMessage: (options: { senderName: string; conversationUrl: string }) => ({
    subject: `Nouveau message de ${options.senderName}`,
    html: layout({
      title: "Vous avez un nouveau message",
      body: `<p><strong>${escapeHtml(options.senderName)}</strong> vous a écrit sur ProFinder.</p>`,
      ctaLabel: "Lire le message",
      ctaUrl: options.conversationUrl,
    }),
  }),
};
