import { NextResponse } from "next/server";
import { fetchWithGoogleAuth } from "@/lib/google-server";

export async function POST(req: Request) {
  try {
    const { subject, startedAt, durationSec } = await req.json();
    
    const start = new Date(startedAt);
    const end = new Date(startedAt + durationSec * 1000);

    const event = {
      summary: `Estudo: ${subject}`,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    };

    const res = await fetchWithGoogleAuth("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });

    if (!res.ok) throw new Error("Failed to create event");
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
