import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

const SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET || "bitsom-admin-session-secret";
export const ADMIN_COOKIE_NAME = "admin_session";

export function getSessionToken(): string {
  return createHmac("sha256", SESSION_SECRET).update("admin").digest("hex");
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const expected = getSessionToken();
  if (token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}
