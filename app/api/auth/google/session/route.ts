import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getSheetsAuthFromRequest } from "@/lib/google-sheets";

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ connected: false }, { status: 401 });
  }
  const auth = await getSheetsAuthFromRequest(request);
  return NextResponse.json({ connected: !!auth });
}
