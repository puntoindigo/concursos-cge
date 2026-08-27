import { cookies } from "next/headers";
import { PI_COOKIE_NAME, verifyPiSession, PiSessionPayload } from "./pi-session";
import { getDb } from "@/db";
import { allowedEmails } from "@/db/schema";
import { eq } from "drizzle-orm";

const SUPERADMIN = "daeiman@gmail.com";

export type AuthResult =
  | { ok: true; user: PiSessionPayload }
  | { ok: false; reason: "no_cookie" | "invalid_token" | "not_allowed" };

export async function getUser(): Promise<AuthResult> {
  const jar = await cookies();
  const token = jar.get(PI_COOKIE_NAME)?.value;
  if (!token) return { ok: false, reason: "no_cookie" };

  const secret = process.env.PI_SESSION_SECRET;
  if (!secret) return { ok: false, reason: "invalid_token" };

  const payload = verifyPiSession(token, secret);
  if (!payload) return { ok: false, reason: "invalid_token" };

  const email = payload.email.toLowerCase();

  // Superadmin always has access
  if (email === SUPERADMIN) return { ok: true, user: payload };

  // Check DB allowlist
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(allowedEmails)
      .where(eq(allowedEmails.email, email))
      .limit(1);
    if (row) return { ok: true, user: payload };
  } catch {
    // DB error — deny
  }

  return { ok: false, reason: "not_allowed" };
}
