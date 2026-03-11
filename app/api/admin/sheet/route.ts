import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  SHEET_ID,
  getSheetsAuthFromRequest,
  getSheetsClient,
  columnLetter,
} from "@/lib/google-sheets";

export async function PATCH(request: NextRequest) {
  const ok = await isAdminAuthenticated();
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await getSheetsAuthFromRequest(request);
  if (!auth) {
    return NextResponse.json(
      {
        error:
          "Connect your Google account first (Admin → Connect Google account for Sheets).",
      },
      { status: 503 }
    );
  }

  let body: { rowIndex: number; updates: Record<string, string | number> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { rowIndex, updates } = body;
  if (
    typeof rowIndex !== "number" ||
    rowIndex < 0 ||
    !updates ||
    typeof updates !== "object"
  ) {
    return NextResponse.json(
      { error: "Body must include rowIndex (number) and updates (object)" },
      { status: 400 }
    );
  }

  try {
    const sheets = getSheetsClient(auth);

    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
    });
    const sheet = spreadsheet.data.sheets?.[0];
    if (!sheet?.properties?.title) {
      return NextResponse.json(
        { error: "Could not read sheet metadata" },
        { status: 500 }
      );
    }
    const sheetTitle = sheet.properties.title;

    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${sheetTitle}'!1:1`,
    });
    const headerRow = headerRes.data.values?.[0] as string[] | undefined;
    if (!headerRow?.length) {
      return NextResponse.json(
        { error: "Could not read header row" },
        { status: 500 }
      );
    }

    const values = headerRow.map((h) => {
      const v = updates[h];
      return v !== undefined && v !== null ? String(v) : "";
    });

    const dataRow = rowIndex + 2;
    const lastCol = columnLetter(headerRow.length - 1);
    const range = `'${sheetTitle}'!A${dataRow}:${lastCol}${dataRow}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [values] },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Sheet update error", e);
    const message =
      e instanceof Error ? e.message : "Failed to update sheet";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
