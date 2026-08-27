import { WpPost, decodeHtml } from './fetcher'
import { CATEGORY_NAME } from './categories'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

function levelBadges(categories: number[]): string {
  const levels = [149, 150, 151, 152, 208]
  return categories
    .filter((id) => levels.includes(id))
    .map(
      (id) =>
        `<span style="display:inline-block;background:#e0e7ff;color:#4338ca;font-size:11px;font-weight:600;padding:2px 8px;border-radius:9999px;margin-right:4px;">${CATEGORY_NAME[id] ?? id}</span>`
    )
    .join('')
}

export function buildEmailHtml(posts: WpPost[], filterSummary?: string): string {
  const rows = posts
    .map((p) => {
      const title = decodeHtml(p.title.rendered)
      const excerpt = decodeHtml(p.excerpt.rendered)
      return `
      <tr>
        <td style="padding:16px 24px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
          <div style="margin-bottom:6px;">${levelBadges(p.categories)}</div>
          <div style="margin-bottom:4px;">
            <a href="${p.link}"
               style="color:#4f46e5;text-decoration:none;font-weight:600;font-size:14px;line-height:1.4;">
              ${title}
            </a>
          </div>
          ${excerpt ? `<div style="color:#6b7280;font-size:12px;margin-bottom:6px;">${excerpt.slice(0, 120)}${excerpt.length > 120 ? '…' : ''}</div>` : ''}
          <div style="display:flex;align-items:center;gap:12px;">
            <span style="color:#9ca3af;font-size:12px;">📅 ${formatDate(p.date)}</span>
            <a href="${p.link}" style="color:#4f46e5;font-size:12px;font-weight:500;">Ver concurso →</a>
          </div>
        </td>
      </tr>`
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Nuevos Concursos CGE</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:640px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#4338ca 0%,#6366f1 100%);padding:36px 40px;">
      <p style="margin:0 0 6px;color:#c7d2fe;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">
        Consejo General de Educación · Entre Ríos
      </p>
      <h1 style="margin:0;color:#fff;font-size:26px;font-weight:700;line-height:1.2;">
        Nuevos Concursos Docentes
      </h1>
      ${filterSummary ? `<p style="margin:12px 0 0;color:#e0e7ff;font-size:13px;">${filterSummary}</p>` : ''}
    </div>

    <!-- Summary bar -->
    <div style="background:#f9fafb;border-bottom:1px solid #e5e7eb;padding:14px 40px;display:flex;align-items:center;gap:8px;">
      <span style="background:#4f46e5;color:#fff;font-size:18px;font-weight:700;min-width:32px;height:32px;border-radius:9999px;display:inline-flex;align-items:center;justify-content:center;">
        ${posts.length}
      </span>
      <span style="color:#374151;font-size:14px;font-weight:500;">
        nuevo${posts.length !== 1 ? 's' : ''} concurso${posts.length !== 1 ? 's' : ''} encontrado${posts.length !== 1 ? 's' : ''}
      </span>
    </div>

    <!-- Posts list -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${rows}
    </table>

    <!-- CTA -->
    <div style="padding:28px 40px;text-align:center;border-top:1px solid #f3f4f6;">
      <a href="https://cge.entrerios.gov.ar/category/parana-concursos/"
         style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-weight:600;font-size:14px;letter-spacing:0.02em;">
        Ver todos los concursos en CGE
      </a>
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
      <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;">
        Alerta automática generada por el Monitor de Concursos CGE<br>
        Desarrollado por
        <a href="https://puntoindigo.com" style="color:#4f46e5;text-decoration:none;font-weight:500;">Puntoindigo</a>
      </p>
    </div>

  </div>
</body>
</html>`
}
