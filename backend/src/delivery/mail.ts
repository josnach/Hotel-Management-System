import nodemailer, { type Transporter } from 'nodemailer';
import { config, mailConfigured } from '../config';

let transporter: Transporter | null = null;
const get = () => (transporter ??= nodemailer.createTransport({
  host: config.mail.host, port: config.mail.port, secure: config.mail.secure,
  auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
  connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
}));

export async function sendEmail(m: { to: string; subject: string; text: string; html: string; attachments?: { filename: string; content: Buffer; contentType?: string }[] }) {
  if (!mailConfigured()) throw new Error('Email is not configured (set SMTP_HOST and MAIL_FROM)');
  const info = await get().sendMail({ from: config.mail.from, to: m.to, subject: m.subject, text: m.text, html: m.html, attachments: m.attachments });
  return { id: String(info.messageId ?? '') };
}