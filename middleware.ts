import { NextResponse, type NextRequest } from "next/server";

// Signed-in areas. The API verifies the session; this only avoids a flash of
// protected UI for visitors without a session cookie.
const PROTECTED = ["/", "/garage", "/onboarding"];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const needsAuth = PROTECTED.some((p) => (p === "/" ? pathname === "/" : pathname.startsWith(p)));
  if (needsAuth && !req.cookies.get("cm_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/", "/garage/:path*", "/onboarding/:path*"] };
