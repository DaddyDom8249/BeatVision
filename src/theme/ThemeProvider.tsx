import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../lib/supabase/client';
import { AppearanceStore } from './appearance';

const Context = createContext<AppearanceStore | null>(null);
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new AppearanceStore(supabase.auth, window));
  useEffect(() => { store.start(); return () => store.stop(); }, [store]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useAppearance() {
  const store = useContext(Context);
  if (!store) throw new Error('ThemeProvider is required');
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { ...state, setTheme: store.setTheme, setMotion: store.setMotion, retrySync: store.retrySync };
}
