import { createHash, randomBytes, createCipheriv, createDecipheriv } from "crypto";

const COOKIE_NAME = "google_sheets_refresh";
const SECRET =
  process.env.ADMIN_SESSION_SECRET || "bitsom-admin-session-secret";

function getKey(): Buffer {
  return createHash("sha256").update(SECRET).digest();
}

export function encryptRefreshToken(refreshToken: string): string {
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([
    cipher.update(refreshToken, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptRefreshToken(payload: string): string | null {
  try {
    const key = getKey();
    const buf = Buffer.from(payload, "base64url");
    if (buf.length < 16 + 16 + 1) return null;
    const iv = buf.subarray(0, 16);
    const tag = buf.subarray(16, 32);
    const enc = buf.subarray(32);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc) + decipher.final("utf8");
  } catch {
    return null;
  }
}

export const GOOGLE_SHEETS_REFRESH_COOKIE = COOKIE_NAME;
