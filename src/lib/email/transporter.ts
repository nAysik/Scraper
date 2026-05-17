// src/lib/email/transporter.ts
import nodemailer from 'nodemailer';

let _transporter: nodemailer.Transporter | null = null;

export function resetTransporter(): void {
  _transporter = null;
}

export async function getTransporter(): Promise<nodemailer.Transporter> {
  if (_transporter) return _transporter;

  const user = process.env.SMTP_USER ?? '';
  const pass = process.env.SMTP_PASS ?? '';

  if (!user || !pass) {
    throw new Error('SMTP_USER and SMTP_PASS must be set in .env.local');
  }

  try {
    const t = nodemailer.createTransport({
      host: 'send.one.com',
      port: 587,
      secure: false,
      auth: { user, pass },
    });
    await t.verify();
    _transporter = t;
    console.log('[email] Connected via STARTTLS (port 587)');
    return _transporter;
  } catch (err) {
    console.warn('[email] STARTTLS failed, falling back to SSL port 465:', err);
  }

  _transporter = nodemailer.createTransport({
    host: 'send.one.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  console.log('[email] Connected via SSL (port 465)');
  return _transporter;
}
