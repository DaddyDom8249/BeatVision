import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase/client";
import { applyAppearance, appearanceFromMetadata, readLocalAppearance, writeLocalAppearance, type AppearancePreferences, type BeatVisionTheme } from "./appearance";

type SaveStatus = "local" | "saving" | "account" | "unsynced" | "failed";
type Context = {
  preferences: AppearancePreferences;
  status: SaveStatus;
  setTheme: (theme: BeatVisionTheme) => void;
  setReducedMotion: (enabled: boolean) => void;
};
const ThemeContext = createContext<Context | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(readLocalAppearance);
  const [status, setStatus] = useState<SaveStatus>("local");
  const changed = useRef(false);
  const sequence = useRef(0);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);

  useEffect(() => { applyAppearance(preferences); }, [preferences]);

  useEffect(() => {
    mounted.current = true;
    const restore = (metadata: unknown) => {
      const found = appearanceFromMetadata(metadata);
      if (found && !changed.current && mounted.current) {
        setPreferences(found);
        writeLocalAppearance(found);
        setStatus("account");
      }
    };
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!error && data.user) restore(data.user.user_metadata);
    }).catch(() => {});
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "USER_UPDATED") && session?.user)
        restore(session.user.user_metadata);
    });
    return () => { mounted.current = false; data.subscription.unsubscribe(); };
  }, []);

  const save = useCallback((next: AppearancePreferences) => {
    changed.current = true;
    setPreferences(next);
    applyAppearance(next);
    const local = writeLocalAppearance(next);
    setStatus(local ? "saving" : "failed");
    const id = ++sequence.current;
    writeQueue.current = writeQueue.current.catch(() => {}).then(async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (!data.user) {
          if (mounted.current && id === sequence.current) setStatus(local ? "local" : "failed");
          return;
        }
        const response = await supabase.auth.updateUser({ data: { beatvision_appearance: next } });
        if (response.error) throw response.error;
        if (mounted.current && id === sequence.current) setStatus("account");
      } catch {
        if (mounted.current && id === sequence.current) setStatus(local ? "unsynced" : "failed");
      }
    });
  }, []);

  const setTheme = useCallback((theme: BeatVisionTheme) => {
    save({ ...preferences, theme });
  }, [preferences, save]);
  const setReducedMotion = useCallback((reducedMotion: boolean) => {
    save({ ...preferences, reducedMotion });
  }, [preferences, save]);

  return <ThemeContext.Provider value={{ preferences, status, setTheme, setReducedMotion }}>
    {children}
  </ThemeContext.Provider>;
}

export function useAppearance(): Context {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("ThemeProvider is required");
  return context;
}
