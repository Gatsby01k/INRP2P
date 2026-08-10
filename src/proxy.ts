import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "inrp2p_session";

// First gate: cookie presence. Role-level authorization happens server-side
// in each workspace layout (and again inside every server action).
export function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/company/:path*", "/partner/:path*", "/account/:path*"],
};
