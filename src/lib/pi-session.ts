import crypto from "crypto";

export interface PiSessionPayload {
  email:         string;
  name:          string | null;
  picture:       string | null;
  role?:         string;
  adminProjects?: string[];
  exp:           number;
}

export const PI_COOKIE_NAME = "pi_session";
export const PI_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

const toB64 = (buf: Buffer | string) =>
  (Buffer.isBuffer(buf) ? buf : Buffer.from(buf, "utf8"))
    .toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromB64 = (s: string) => {
  const p = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = p.length % 4 ? 4 - (p.length % 4) : 0;
  return Buffer.from(p + "=".repeat(pad), "base64").toString("utf8");
};

const hmac = (data: string, secret: string) =>
  toB64(crypto.createHmac("sha256", secret).update(data).digest());

export function verifyPiSession(
  token: string,
  secret: string
): PiSessionPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = hmac(body, secret);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(fromB64(body)) as PiSessionPayload;
    if (!payload?.email || !payload?.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
