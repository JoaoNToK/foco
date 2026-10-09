import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { refresh_token } = await req.json();
    const client_id = process.env.GOOGLE_CLIENT_ID;
    const client_secret = process.env.GOOGLE_CLIENT_SECRET;

    if (!client_id || !client_secret) {
      return NextResponse.json({ error: 'Faltam as credenciais do Google no servidor' }, { status: 500 });
    }

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id,
        client_secret,
        refresh_token,
        grant_type: "refresh_token",
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || "Falha ao renovar o token");

    return NextResponse.json({ access_token: data.access_token });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
