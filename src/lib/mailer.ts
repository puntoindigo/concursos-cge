import nodemailer from 'nodemailer'
import { WpPost } from './fetcher'
import { buildEmailHtml } from './email-template'
import { CATEGORY_NAME } from './categories'

function buildTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: parseInt(process.env.SMTP_PORT ?? '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
    tls: { rejectUnauthorized: false },
  })
}

export async function sendConcursosEmail(
  posts: WpPost[],
  to: string,
  categoryDepts: number[],
  categoryLevels: number[]
): Promise<void> {
  const deptNames = categoryDepts.map((id) => CATEGORY_NAME[id] ?? id).join(', ')
  const levelNames = categoryLevels.map((id) => CATEGORY_NAME[id] ?? id).join(', ')
  const filterSummary = [deptNames && `Depto: ${deptNames}`, levelNames && `Nivel: ${levelNames}`]
    .filter(Boolean)
    .join(' · ')

  const count = posts.length
  const subject = `🎓 ${count} nuevo${count !== 1 ? 's' : ''} concurso${count !== 1 ? 's' : ''} — CGE Entre Ríos`

  const transport = buildTransport()
  await transport.sendMail({
    from: `"Monitor CGE" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html: buildEmailHtml(posts, filterSummary),
  })
}

export async function verifySmtp(): Promise<{ ok: boolean; error?: string }> {
  try {
    const transport = buildTransport()
    await transport.verify()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}
