import { NextRequest, NextResponse } from "next/server";

const PI_COOKIE = "pi_session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect API routes that require auth — return 401 if no session cookie.
  // Page routes pass through: page.tsx handles the unauthenticated state and
  // shows the login page with the "Acceder con Google" button.
  if (
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/posts") &&
    !pathname.startsWith("/api/post/")
  ) {
    if (!request.cookies.get(PI_COOKIE)?.value) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
