import { NextRequest, NextResponse } from "next/server";

// The studio uses same-origin APIs. Reject browser cross-origin mutations even
// when a browser has cached the administrator's HTTP authentication credentials.
export function middleware(request: NextRequest) {
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    let wrongOrigin = false;
    if (origin) {
      try { wrongOrigin = new URL(origin).host !== request.headers.get("host"); }
      catch { wrongOrigin = true; }
    }
    if (wrongOrigin || request.headers.get("sec-fetch-site") === "cross-site") {
      return NextResponse.json({ error: "Same-origin requests required" }, { status: 403 });
    }
  }
  return NextResponse.next();
}
export const config = { matcher: ["/api/:path*"] };
