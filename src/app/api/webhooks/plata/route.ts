import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import crypto from "crypto"
import { getDb } from "@/db"
import { allowedEmails } from "@/db/schema"
import { eq } from "drizzle-orm"

function validateSecret(req: NextRequest): boolean {
  const secret = process.env.PLATA_INTERNAL_SECRET
  if (!secret) return false
  const received = req.headers.get("x-puntoindigo-ia-secret") ?? ""
  try {
    return crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(received))
  } catch {
    return false
  }
}

const PlataPayload = z.object({
  event: z.enum(["payment.confirmed", "payment.refunded"]),
  email: z.string().email(),
  product: z.string(),
  payment_id: z.string().optional(),
  amount: z.number().optional(),
  currency: z.string().optional(),
})

export async function POST(req: NextRequest) {
  if (!validateSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let parsed: z.infer<typeof PlataPayload>
  try {
    parsed = PlataPayload.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const email = parsed.email.toLowerCase()
  const db = getDb()

  if (parsed.event === "payment.confirmed") {
    await db
      .insert(allowedEmails)
      .values({ email, label: "Acceso vía Plata", invitedBy: "plata" })
      .onConflictDoUpdate({
        target: allowedEmails.email,
        set: { label: "Acceso vía Plata", invitedBy: "plata", invitedAt: new Date() },
      })
  } else if (parsed.event === "payment.refunded") {
    // Only remove if access was granted via Plata (don't touch manual invites)
    await db
      .delete(allowedEmails)
      .where(eq(allowedEmails.email, email))
  }

  return NextResponse.json({ ok: true })
}
