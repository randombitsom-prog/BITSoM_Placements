import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  SHEET_ID,
  getSheetsAuthFromRequest,
  getSheetsClient,
  columnLetter,
} from "@/lib/google-sheets";
import OpenAI from "openai";
import Exa from "exa-js";

export const maxDuration = 120;

/**
 * POST /api/admin/sheet/industry/lookup
 * Looks up each company's industry online (Exa + OpenAI), then updates the sheet via Google Sheets API (OAuth).
 */
export async function POST(request: NextRequest) {
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

  if (!process.env.EXA_API_KEY) {
    return NextResponse.json(
      { error: "EXA_API_KEY is not set. Add it to env to use online lookup." },
      { status: 500 }
    );
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set. Required for industry extraction." },
      { status: 500 }
    );
  }

  const exa = new Exa(process.env.EXA_API_KEY);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

    const companies = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      const company = String((rows[i][companyCol] ?? "").trim());
      if (company) companies.add(company);
    }
    const companyList = Array.from(companies);
    if (companyList.length === 0) {
      return NextResponse.json({
        success: true,
        updatedCount: 0,
        lookedUp: 0,
        message: "No companies found in the sheet.",
      });
    }

    const updates: Record<string, string> = {};

    for (const company of companyList) {
      try {
        const { results } = await exa.search(
          `${company} company industry sector business`,
          {
            contents: { text: true },
            numResults: 3,
          }
        );
        const snippets = (results || [])
          .map((r) => (r as { text?: string }).text?.slice(0, 800) || "")
          .filter(Boolean)
          .join("\n\n");

        if (!snippets.trim()) {
          updates[company] = "Unknown";
          continue;
        }

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are a researcher. Given a company name and web search snippets, output exactly one short industry or sector label (e.g. "Consulting", "E-commerce", "IT Services", "Banking & Financial Services", "Manufacturing", "Retail"). Use 1-5 words only. No explanation, no quotes, no period.`,
            },
            {
              role: "user",
              content: `Company: ${company}\n\nSnippets:\n${snippets.slice(0, 3000)}`,
            },
          ],
          max_tokens: 30,
          temperature: 0.2,
        });
        const industry =
          completion.choices[0]?.message?.content?.trim() || "Unknown";
        updates[company] = industry.replace(/^["']|["']\.?$/g, "").trim() || "Unknown";
      } catch (e) {
        console.warn(`Lookup failed for ${company}`, e);
        updates[company] = "Unknown";
      }
    }

    let updatedCount = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const company = String((row[companyCol] ?? "").trim());
      const industry = updates[company];
      if (industry !== undefined) {
        while (row.length <= industryCol) row.push("");
        row[industryCol] = industry;
        updatedCount += 1;
      }
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
      lookedUp: companyList.length,
      updates,
      message: `Looked up ${companyList.length} companies and updated ${updatedCount} row(s) in the sheet.`,
    });
  } catch (e) {
    console.error("Industry lookup error", e);
    const message =
      e instanceof Error ? e.message : "Failed to look up or update industries";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
