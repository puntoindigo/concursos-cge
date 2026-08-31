import nodemailer from 'nodemailer'

const ADMIN_EMAIL = 'daeiman@gmail.com'

function buildTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: parseInt(process.env.SMTP_PORT ?? '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
    tls: { rejectUnauthorized: false },
  })
}

export async function notifyError(opts: {
  endpoint: string
  error: unknown
  userEmail?: string
  userName?: string
  extra?: Record<string, unknown>
}): Promise<void> {
  try {
    const { endpoint, error, userEmail, userName, extra } = opts
    const ts = new Date().toLocaleString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    const errorStr = error instanceof Error
      ? `${error.name}: ${error.message}\n\n${error.stack ?? ''}`
      : String(error)

    const extraHtml = extra
      ? `<tr>
           <td style="padding:6px 0;color:#6b7280;font-size:13px;vertical-align:top">Extra</td>
           <td style="padding:6px 0">
             <pre style="background:#f3f4f6;padding:8px;border-radius:4px;font-size:12px;margin:0;white-space:pre-wrap">${JSON.stringify(extra, null, 2)}</pre>
           </td>
         </tr>`
      : ''

    const transport = buildTransport()
    await transport.sendMail({
      from: `"Monitor CGE – Errores" <${process.env.SMTP_USER}>`,
      to: ADMIN_EMAIL,
      subject: `[ERROR] concursos-cge · ${endpoint}`,
      html: `
        <div style="font-family:sans-serif;max-width:620px;margin:0 auto;padding:24px">
          <h2 style="color:#dc2626;margin:0 0 4px">Error en Monitor CGE</h2>
          <p style="color:#6b7280;font-size:13px;margin:0 0 20px">Se disparó un error en producción. Revisar logs de Vercel para más detalles.</p>
          <table style="width:100%;border-collapse:collapse">
            <tr>
              <td style="padding:6px 0;color:#6b7280;font-size:13px;width:140px">Endpoint</td>
              <td style="padding:6px 0;font-weight:600;font-size:14px">${endpoint}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#6b7280;font-size:13px">Fecha/hora (ART)</td>
              <td style="padding:6px 0;font-weight:600;font-size:14px">${ts}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#6b7280;font-size:13px">Usuario</td>
              <td style="padding:6px 0;font-weight:600;font-size:14px">${
                userEmail
                  ? `${userEmail}${userName ? ` (${userName})` : ''}`
                  : '<em style="color:#9ca3af">no autenticado</em>'
              }</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#6b7280;font-size:13px;vertical-align:top">Error</td>
              <td style="padding:6px 0">
                <pre style="background:#fef2f2;border:1px solid #fecaca;padding:10px;border-radius:4px;font-size:12px;margin:0;white-space:pre-wrap">${errorStr}</pre>
              </td>
            </tr>
            ${extraHtml}
          </table>
          <hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb">
          <p style="color:#9ca3af;font-size:12px;text-align:center">
            Desarrollado por <a href="https://puntoindigo.com" style="color:#4f46e5">Puntoindigo</a>
          </p>
        </div>`,
    })
  } catch {
    console.error('[error-notify] No se pudo enviar la notificación de error')
  }
}
