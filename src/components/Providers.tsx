"use client";

import { useEffect, useState } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { useStore } from "@/store/useStore";
import { supabase } from "@/lib/supabase";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  // Reidratação manual do Zustand (skipHydration) -> sem Hydration Mismatch.
  useEffect(() => {
    void Promise.resolve(useStore.persist.rehydrate()).then(() => setReady(true));
  }, []);

  // Auth Supabase + sincronização
  useEffect(() => {
    if (!ready || !supabase) return;

    async function handleSession(s: any) {
      if (!s) {
        useStore.getState().setAuth(null, null);
        return;
      }

      if (s.provider_token || s.provider_refresh_token) {
        await fetch("/api/auth/store-google-tokens", {
          method: "POST",
          body: JSON.stringify({
            provider_token: s.provider_token,
            provider_refresh_token: s.provider_refresh_token
          }),
        });

        // Remove do localStorage para evitar XSS
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (url) {
          try {
            const projectId = url.split("//")[1].split(".")[0];
            const storageKey = `sb-${projectId}-auth-token`;
            const stored = localStorage.getItem(storageKey);
            if (stored) {
              const parsed = JSON.parse(stored);
              delete parsed.provider_token;
              delete parsed.provider_refresh_token;
              localStorage.setItem(storageKey, JSON.stringify(parsed));
            }
          } catch (e) {}
        }
      }

      useStore.getState().setAuth(s.user.id, s.user.email);
      void useStore.getState().loadRemote().then(() => useStore.getState().refreshCalendar());
    }

    supabase.auth.getSession().then(({ data }) => handleSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => handleSession(s));
    return () => sub.subscription.unsubscribe();
  }, [ready]);

  // Reenvia pendentes quando a internet volta + checa calendário a cada minuto
  useEffect(() => {
    if (!ready) return;
    const online = () => void useStore.getState().flushPending();
    window.addEventListener("online", online);
    const cal = setInterval(() => void useStore.getState().refreshCalendar(), 60_000);
    return () => {
      window.removeEventListener("online", online);
      clearInterval(cal);
    };
  }, [ready]);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
      <div
        aria-busy={!ready}
        className={`transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"}`}
      >
        {children}
      </div>
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: "var(--surface)",
            color: "var(--fg)",
            border: "1px solid var(--line)",
          },
        }}
      />
    </ThemeProvider>
  );
}
