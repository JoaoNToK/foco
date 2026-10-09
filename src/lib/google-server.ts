import { cookies } from "next/headers";

export async function getValidGoogleToken(): Promise<string | null> {
  const cookieStore = await cookies();
  let accessToken = cookieStore.get("google_access_token")?.value;
  const refreshToken = cookieStore.get("google_refresh_token")?.value;

  if (accessToken) {
    return accessToken;
  }

  if (!refreshToken) return null;

  const client_id = process.env.GOOGLE_CLIENT_ID;
  const client_secret = process.env.GOOGLE_CLIENT_SECRET;

  if (!client_id || !client_secret) return null;

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id,
        client_secret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    accessToken = data.access_token;

    cookieStore.set("google_access_token", accessToken!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 3600, // 1 hour
    });

    return accessToken || null;
  } catch {
    return null;
  }
}

export async function fetchWithGoogleAuth(url: string, options: RequestInit = {}) {
  let token = await getValidGoogleToken();
  if (!token) throw new Error("Unauthorized");

  let res = await fetch(url, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    const cookieStore = await cookies();
    cookieStore.delete("google_access_token");
    token = await getValidGoogleToken();
    if (!token) throw new Error("Unauthorized");
    
    res = await fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
    });
  }

  return res;
}
