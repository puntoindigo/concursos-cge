import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(req: NextRequest) {
  const { email, name } = await req.json().catch(() => ({}));
  if (!email) return NextResponse.json({ ok: false });

  const now = new Date().toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST!,
      port: parseInt(process.env.SMTP_PORT ?? "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
      tls: { rejectUnauthorized: false },
    });

    await transport.sendMail({
      from: `"Monitor CGE" <${process.env.SMTP_USER}>`,
      to: "daeiman@gmail.com",
      subject: `🔔 Acceso a Monitor CGE — ${email}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#4338ca;margin:0 0 16px">Nuevo acceso detectado</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Usuario</td>
                <td style="padding:8px 0;font-weight:600">${name || "—"}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Email</td>
                <td style="padding:8px 0;font-weight:600">${email}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Hora (ART)</td>
                <td style="padding:8px 0;font-weight:600">${now}</td></tr>
          </table>
          <hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb">
          <p style="color:#9ca3af;font-size:12px;text-align:center">
            Desarrollado por <a href="https://puntoindigo.com" style="color:#4f46e5">Puntoindigo</a>
          </p>
        </div>`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    // Notification failure is non-critical
    console.error("[notify] SMTP error:", e);
    return NextResponse.json({ ok: false });
  }
}
