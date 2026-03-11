import { google } from "googleapis";

export const SHEET_ID =
  process.env.NEXT_PUBLIC_BITSOM_SHEET_ID ||
  process.env.BITSOM_SHEET_ID ||
  "1sNESQWi2MQlIXuJ99zshKkFGw3bIoG7IgbYizqaaRIo";

/**
 * Returns Google Auth for Sheets API using service account credentials.
 * Set GOOGLE_SHEETS_CREDENTIALS (JSON string) or GOOGLE_APPLICATION_CREDENTIALS (path to JSON).
 */
function getSheetsAuth(): InstanceType<typeof google.auth.GoogleAuth> {
  const credsJson = process.env.GOOGLE_SHEETS_CREDENTIALS;
  if (credsJson) {
    try {
      const credentials = JSON.parse(credsJson);
      return new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
    } catch (e) {
      console.error("Invalid GOOGLE_SHEETS_CREDENTIALS JSON", e);
    }
  }
  return new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

export function getSheetsClient() {
  return google.sheets({ version: "v4", auth: getSheetsAuth() });
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
