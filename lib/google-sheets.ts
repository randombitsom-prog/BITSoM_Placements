import { NextRequest } from "next/server";
import { google } from "googleapis";
import {
  decryptRefreshToken,
  GOOGLE_SHEETS_REFRESH_COOKIE,
} from "./google-sheets-oauth";

export const SHEET_ID =
  process.env.NEXT_PUBLIC_BITSOM_SHEET_ID ||
  process.env.BITSOM_SHEET_ID ||
  "1sNESQWi2MQlIXuJ99zshKkFGw3bIoG7IgbYizqaaRIo";

function getRedirectUri(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || "";
  const origin = base.startsWith("http") ? base : base ? `https://${base}` : "";
  return origin ? `${origin}/api/auth/google/callback` : "";
}

/**
 * Returns an OAuth2 client for Sheets API using the refresh token stored in the request cookie.
 * Use this in admin sheet API routes; requires admin to have completed "Connect Google account".
 */
export async function getSheetsAuthFromRequest(
  request: NextRequest
): Promise<InstanceType<typeof google.auth.OAuth2> | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = getRedirectUri();
  if (!clientId || !clientSecret || !redirectUri) return null;

  const cookie = request.cookies.get(GOOGLE_SHEETS_REFRESH_COOKIE)?.value;
  if (!cookie) return null;

  const refreshToken = decryptRefreshToken(cookie);
  if (!refreshToken) return null;

  const OAuth2 = google.auth.OAuth2;
  const client = new OAuth2(clientId, clientSecret, redirectUri);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

export function getSheetsClient(
  auth: InstanceType<typeof google.auth.OAuth2>
) {
  return google.sheets({ version: "v4", auth });
}

export function columnLetter(index: number): string {
  let letter = "";
  let n = index + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    letter = String.fromCharCode(65 + r) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}
