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
    const { setAuth, loadRemote, refreshCalendar } = useStore.getState();
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session;
      setAuth(s?.user.id ?? null, s?.user.email ?? null, s?.provider_token, s?.provider_refresh_token);
      if (s) void loadRemote().then(refreshCalendar);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      useStore.getState().setAuth(s?.user.id ?? null, s?.user.email ?? null, s?.provider_token, s?.provider_refresh_token);
      if (s) void useStore.getState().loadRemote().then(() => useStore.getState().refreshCalendar());
    });
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
