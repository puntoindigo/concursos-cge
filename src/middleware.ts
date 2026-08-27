import { NextRequest, NextResponse } from "next/server";
import { verifyPiSession, PI_COOKIE_NAME } from "@/lib/pi-session";

const ACCOUNTS_LOGIN = "https://accounts.puntoindigo.com/api/auth/signin-google";

// Emails with access to this app
const ALLOWED_EMAILS = ["daeiman@gmail.com", "pagosrecoleccion@gmail.com"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Let Vercel cron and internal API calls through (bot/cron runs server-side)
  if (pathname.startsWith("/api/")) return NextResponse.next();
  if (pathname.startsWith("/_next/")) return NextResponse.next();
  if (pathname.startsWith("/favicon")) return NextResponse.next();

  const secret = process.env.PI_SESSION_SECRET;
  if (!secret) {
    // Misconfigured — show error rather than blocking
    return NextResponse.next();
  }

  const token = request.cookies.get(PI_COOKIE_NAME)?.value;
  if (!token) {
    return redirectToLogin(request);
  }

  const payload = verifyPiSession(token, secret);
  if (!payload) {
    return redirectToLogin(request);
  }

  if (!ALLOWED_EMAILS.includes(payload.email.toLowerCase())) {
    return new NextResponse(
      `<html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2>Acceso no autorizado</h2>
        <p>Tu cuenta (${payload.email}) no tiene permiso para acceder a esta aplicación.</p>
        <a href="https://accounts.puntoindigo.com/api/auth/logout">Cerrar sesión</a>
      </body></html>`,
      { status: 403, headers: { "Content-Type": "text/html" } }
    );
  }

  // Pass user info to server components via headers
  const response = NextResponse.next();
  response.headers.set("x-pi-email", payload.email);
  response.headers.set("x-pi-name", payload.name ?? "");
  response.headers.set("x-pi-picture", payload.picture ?? "");
  return response;
}

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL(ACCOUNTS_LOGIN);
  loginUrl.searchParams.set("next", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
