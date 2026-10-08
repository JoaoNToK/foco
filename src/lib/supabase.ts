import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** null quando as variáveis não estão configuradas: o app funciona 100% local. */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
    : null;

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export async function signInWithGoogle() {
  if (!supabase) throw new Error("Supabase não configurado");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      scopes: CALENDAR_SCOPE,
      redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase?.auth.signOut();
}
