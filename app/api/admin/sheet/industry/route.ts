import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  SHEET_ID,
  getSheetsClient,
  columnLetter,
} from "@/lib/google-sheets";

/**
 * POST body: { updates: Record<string, string> }
 * Updates all rows in the sheet where Company matches a key to the given Industry.
 */
export async function POST(request: NextRequest) {
  const ok = await isAdminAuthenticated();
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { updates: Record<string, string> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { updates } = body;
  if (!updates || typeof updates !== "object") {
    return NextResponse.json(
      { error: "Body must include updates: { companyName: industry }" },
      { status: 400 }
    );
  }

  const companyToIndustry = new Map<string, string>();
  for (const [company, industry] of Object.entries(updates)) {
    const c = String(company).trim();
    if (c) companyToIndustry.set(c, String(industry).trim());
  }
  if (companyToIndustry.size === 0) {
    return NextResponse.json(
      { error: "No company→industry entries to apply" },
      { status: 400 }
    );
  }

  try {
    const sheets = getSheetsClient();

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

    const companyCol = headerRow.findIndex(
      (h) => (h || "").toLowerCase() === "company"
    );
    const industryCol = headerRow.findIndex(
      (h) => (h || "").toLowerCase() === "industry"
    );
    if (companyCol === -1) {
      return NextResponse.json(
        { error: 'Sheet must have a "Company" column' },
        { status: 400 }
      );
    }
    if (industryCol === -1) {
      return NextResponse.json(
        { error: 'Sheet must have an "Industry" column' },
        { status: 400 }
      );
    }

    const lastColLetter = columnLetter(headerRow.length - 1);
    const dataRange = `'${sheetTitle}'!A2:${lastColLetter}1000`;
    const dataRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: dataRange,
    });
    const rows = (dataRes.data.values || []) as string[][];

    let updatedCount = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const company = String((row[companyCol] ?? "").trim());
      const industry = companyToIndustry.get(company);
      if (industry !== undefined) {
        while (row.length <= industryCol) row.push("");
        row[industryCol] = industry;
        updatedCount += 1;
      }
    }

    if (updatedCount === 0) {
      return NextResponse.json({
        success: true,
        updatedCount: 0,
        message: "No rows matched the given company names.",
      });
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: dataRange,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows },
    });

    return NextResponse.json({
      success: true,
      updatedCount,
      message: `Updated industry for ${updatedCount} row(s).`,
    });
  } catch (e) {
    console.error("Bulk industry update error", e);
    const message =
      e instanceof Error ? e.message : "Failed to update sheet";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
