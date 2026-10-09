import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  try {
    const { provider_token, provider_refresh_token } = await req.json();
    const cookieStore = await cookies();
    
    if (provider_token) {
      cookieStore.set("google_access_token", provider_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 3600, // 1 hour
      });
    }
    
    if (provider_refresh_token) {
      cookieStore.set("google_refresh_token", provider_refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
    }
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
