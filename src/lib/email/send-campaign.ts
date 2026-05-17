// src/lib/email/send-campaign.ts
import { getTransporter, resetTransporter } from './transporter';

export interface SendVariables {
  ChannelName: string;
  TopGames:    string;
  Genre:       string;
  Platform:    string;
}

export function substituteVariables(template: string, vars: SendVariables): string {
  return template
    .replace(/\{\{ChannelName\}\}/g, vars.ChannelName)
    .replace(/\{\{TopGames\}\}/g,    vars.TopGames)
    .replace(/\{\{Genre\}\}/g,       vars.Genre)
    .replace(/\{\{Platform\}\}/g,    vars.Platform);
}

export function rewriteClickUrls(html: string, sendId: string): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  if (!appUrl) return html;
  return html.replace(
    /href="(https?:\/\/[^"]+)"/g,
    (_, url: string) =>
      `href="${appUrl}/api/track/click?id=${encodeURIComponent(sendId)}&url=${encodeURIComponent(url)}"`,
  );
}

export const SEND_DELAY_MS = 12_000;

export interface SendEmailOptions {
  to:       string;
  subject:  string;
  textBody: string;
  htmlBody: string;
  sendId:   string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  const user     = process.env.SMTP_USER ?? '';
  const fromName = process.env.FROM_NAME ?? 'Outreach';
  const domain   = user.includes('@') ? user.split('@')[1] : 'mail';

  const htmlWithTracking = rewriteClickUrls(opts.htmlBody, opts.sendId);

  let transporter = await getTransporter();

  const mail = {
    from:      `"${fromName}" <${user}>`,
    replyTo:   user,
    to:        opts.to,
    subject:   opts.subject,
    messageId: `<${opts.sendId}@${domain}>`,
    headers: {
      'List-Unsubscribe': `<mailto:${user}?subject=unsubscribe>`,
    },
    text: opts.textBody,
    html: htmlWithTracking,
  };

  try {
    await transporter.sendMail(mail);
  } catch (err) {
    resetTransporter();
    transporter = await getTransporter();
    await transporter.sendMail(mail);
  }
}
