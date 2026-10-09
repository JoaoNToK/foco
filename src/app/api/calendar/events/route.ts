import { NextResponse } from "next/server";
import { fetchWithGoogleAuth } from "@/lib/google-server";

export async function GET() {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const q = new URLSearchParams({
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
    });

    const res = await fetchWithGoogleAuth(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`);
    
    if (!res.ok) throw new Error("Failed to fetch events");
    const data = await res.json();
    return NextResponse.json(data.items || []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
