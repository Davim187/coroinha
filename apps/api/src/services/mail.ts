import nodemailer from 'nodemailer'
import { env } from '../config.js'

export function mailConfigured() {
  return Boolean(env.smtpHost && env.smtpFrom)
}

export async function sendMail(input: {
  to: string | string[]
  subject: string
  text: string
  html?: string
  attachments?: { filename: string; content: Buffer; contentType?: string }[]
}) {
  if (!mailConfigured()) {
    throw new Error('O envio de e-mail não está configurado. Defina SMTP_HOST e SMTP_FROM.')
  }
  const transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
  })
  const recipients = Array.isArray(input.to) ? input.to : [input.to]
  await transporter.sendMail({
    from: env.smtpFrom,
    to: recipients.join(', '),
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: input.attachments?.map((item) => ({
      filename: item.filename,
      content: item.content,
      contentType: item.contentType,
    })),
  })
  return { sent: recipients.length, recipients }
}
