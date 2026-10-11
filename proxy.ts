import { NextRequest, NextResponse } from "next/server";
import {
  verifySessionCookieValue,
  SESSION_COOKIE_NAME,
} from "@/lib/session";

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/login",
  "/favicon.ico",
]);

export const config = {
  matcher: [
    "/((?!_next/static|_next/image).*)",
  ],
};

export async function proxy(req: NextRequest) {
  const pathname =
    req.nextUrl.pathname.replace(/\/+$/, "") || "/";

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const isValid = await verifySessionCookieValue(
    req.cookies.get(SESSION_COOKIE_NAME)?.value
  );

  if (isValid) {
    return NextResponse.next();
  }

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Sesi berakhir. Silakan login kembali." },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  const response = NextResponse.redirect(
    new URL("/login", req.url)
  );

  response.headers.set("Cache-Control", "no-store");

  return response;
}
