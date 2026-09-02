import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { allowedEmails } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUser } from "@/lib/get-user";
import { notifyError } from "@/lib/error-notify";
import nodemailer from "nodemailer";

const SUPERADMIN = "daeiman@gmail.com";
const APP_URL = process.env.APP_URL ?? "https://concursos-cge.puntoindigo.com";

export async function GET() {
  const auth = await getUser();
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const callerEmail = auth.user.email.toLowerCase();
  const isSuperadmin = callerEmail === SUPERADMIN;

  try {
    const db = getDb();
    const rows = isSuperadmin
      ? await db.select().from(allowedEmails).orderBy(allowedEmails.invitedAt)
      : await db.select().from(allowedEmails)
          .where(eq(allowedEmails.invitedBy, callerEmail))
          .orderBy(allowedEmails.invitedAt);

    return NextResponse.json({ invites: rows });
  } catch (e) {
    await notifyError({ endpoint: "GET /api/invites", error: e, userEmail: auth.user.email });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await getUser();
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const callerEmail = auth.user.email.toLowerCase();

  try {
    const body = await req.json().catch(() => ({}));
    const email = (body.email as string | undefined)?.trim().toLowerCase();
    const label = (body.label as string | undefined)?.trim() || null;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "email inválido" }, { status: 400 });
    }

    const db = getDb();

    await db
      .insert(allowedEmails)
      .values({ email, label, invitedBy: callerEmail })
      .onConflictDoUpdate({
        target: allowedEmails.email,
        set: { label, invitedBy: callerEmail, invitedAt: new Date() },
      });

    // Send invitation email
    let emailSent = false;
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
        to: email,
        subject: "Invitación — Monitor de Concursos CGE (Entre Ríos)",
        html: buildInviteEmail(email, label, callerEmail, APP_URL),
      });
      emailSent = true;
    } catch (e) {
      console.error("[invites] SMTP error:", e);
    }

    return NextResponse.json({ ok: true, emailSent }, { status: 201 });
  } catch (e) {
    await notifyError({ endpoint: "POST /api/invites", error: e, userEmail: callerEmail });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await getUser();
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const callerEmail = auth.user.email.toLowerCase();
  const isSuperadmin = callerEmail === SUPERADMIN;

  try {
    const body = await req.json().catch(() => ({}));
    const email = (body.email as string | undefined)?.trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "email requerido" }, { status: 400 });

    if (email === SUPERADMIN) {
      return NextResponse.json({ error: "no podés eliminar al superadmin" }, { status: 400 });
    }

    const db = getDb();

    // Non-superadmin users can only delete invites they created
    if (!isSuperadmin) {
      const rows = await db.select({ invitedBy: allowedEmails.invitedBy })
        .from(allowedEmails)
        .where(eq(allowedEmails.email, email));
      if (!rows.length || rows[0].invitedBy !== callerEmail) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    }

    await db.delete(allowedEmails).where(eq(allowedEmails.email, email));

    return NextResponse.json({ ok: true });
  } catch (e) {
    await notifyError({ endpoint: "DELETE /api/invites", error: e, userEmail: auth.user.email });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

function buildInviteEmail(email: string, label: string | null, invitedBy: string, appUrl: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:540px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#4338ca,#6366f1);padding:32px 40px;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Invitación al Monitor CGE</h1>
      <p style="margin:8px 0 0;color:#c7d2fe;font-size:13px;">Concursos docentes · Entre Ríos</p>
    </div>
    <div style="padding:32px 40px;">
      <p style="color:#374151;font-size:15px;margin:0 0 20px;">
        <strong>${invitedBy}</strong> te invitó a acceder al <strong>Monitor de Concursos Docentes CGE Entre Ríos</strong>.
      </p>
      <p style="color:#374151;font-size:14px;margin:0 0 28px;">
        Con esta herramienta podés ver y filtrar concursos docentes en tiempo real y recibir alertas automáticas por email cuando se publican nuevos.
      </p>
      <div style="text-align:center;">
        <a href="${appUrl}"
           style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;">
          Ingresar al Monitor
        </a>
      </div>
      <p style="color:#6b7280;font-size:13px;margin:24px 0 0;text-align:center;">
        Iniciás sesión con Google usando <strong>${email}</strong>.<br>
        No necesitás crear ninguna contraseña.
      </p>
    </div>
    <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 40px;text-align:center;">
      <p style="margin:0;color:#9ca3af;font-size:11px;">
        Desarrollado por <a href="https://puntoindigo.com" style="color:#4f46e5;text-decoration:none;">Puntoindigo</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}
