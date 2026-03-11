import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  encryptRefreshToken,
  GOOGLE_SHEETS_REFRESH_COOKIE,
} from "@/lib/google-sheets-oauth";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const errorParam = request.nextUrl.searchParams.get("error");
  if (errorParam) {
    const url = new URL("/admin", request.url);
    url.searchParams.set("google_error", errorParam);
    return NextResponse.redirect(url);
  }
  if (!code) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set" },
      { status: 500 }
    );
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    request.nextUrl.origin;
  const base = origin.startsWith("http") ? origin : `https://${origin}`;
  const redirectUri = `${base}/api/auth/google/callback`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error("Google token exchange failed", err);
    const url = new URL("/admin", request.url);
    url.searchParams.set("google_error", "token_exchange_failed");
    return NextResponse.redirect(url);
  }

  const data = (await tokenRes.json()) as { refresh_token?: string };
  const refreshToken = data.refresh_token;
  if (!refreshToken) {
    const url = new URL("/admin", request.url);
    url.searchParams.set("google_error", "no_refresh_token");
    return NextResponse.redirect(url);
  }

  const encrypted = encryptRefreshToken(refreshToken);
  const cookieStore = await cookies();
  cookieStore.set(GOOGLE_SHEETS_REFRESH_COOKIE, encrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });

  return NextResponse.redirect(new URL("/admin", request.url));
}
