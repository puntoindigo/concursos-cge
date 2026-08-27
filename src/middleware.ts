import { NextRequest, NextResponse } from "next/server";

const PI_COOKIE = "pi_session";
const ACCOUNTS_LOGIN = "https://accounts.puntoindigo.com/api/auth/signin-google";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes, Next.js internals and static assets are always open
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // Edge-safe: only check cookie presence here.
  // Full HMAC verification + allowlist check happens in the Server Component (page.tsx).
  if (!request.cookies.get(PI_COOKIE)?.value) {
    const loginUrl = new URL(ACCOUNTS_LOGIN);
    loginUrl.searchParams.set("next", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
