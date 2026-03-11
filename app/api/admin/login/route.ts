import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionToken, ADMIN_COOKIE_NAME } from "@/lib/admin-auth";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "ipcs";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ipcs@2026";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      return NextResponse.json(
        { success: false, error: "Invalid username or password" },
        { status: 401 }
      );
    }

    const token = getSessionToken();
    const cookieStore = await cookies();
    cookieStore.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return NextResponse.json({
      success: true,
      redirect: "/admin",
    });
  } catch (e) {
    console.error("Admin login error", e);
    return NextResponse.json(
      { success: false, error: "Login failed" },
      { status: 500 }
    );
  }
}
