import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  createSessionCookieValue,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/session";
import {
  assertSameOrigin,
  HttpError,
  isRecord,
  readJsonLimited,
} from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);

    const body = await readJsonLimited(req, 4096);

    if (
      !isRecord(body) ||
      typeof body.password !== "string" ||
      body.password.length === 0 ||
      body.password.length > 512
    ) {
      throw new HttpError("Password tidak valid.", 400);
    }

    const correctPassword = process.env.APP_PASSWORD;

    if (!correctPassword) {
      throw new Error("APP_PASSWORD belum dikonfigurasi.");
    }

    const suppliedHash = createHash("sha256")
      .update(body.password)
      .digest();

    const expectedHash = createHash("sha256")
      .update(correctPassword)
      .digest();

    if (!timingSafeEqual(suppliedHash, expectedHash)) {
      throw new HttpError("Password salah.", 401);
    }

    const cookieValue = await createSessionCookieValue();

    const res = NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } }
    );

    res.cookies.set(SESSION_COOKIE_NAME, cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: "/",
    });

    return res;
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      return NextResponse.json(
        { error: err.message },
        {
          status: err.status,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    console.error("Login configuration or internal failure");

    return NextResponse.json(
      { error: "Login belum dapat diproses. Periksa konfigurasi server." },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
