import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
// @ts-ignore
import { supabase } from '@/db/supabase';
import type { User } from '@supabase/supabase-js';
// @ts-ignore
import type { Profile } from '@/types/types';

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch user profile:', error);
    return null;
  }
  return data;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, username: string) => Promise<{ error: Error | null; emailConfirmRequired?: boolean }>;
  /** @deprecated use signIn */
  signInWithUsername: (username: string, password: string) => Promise<{ error: Error | null }>;
  /** @deprecated use signUp */
  signUpWithUsername: (username: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    if (!user) {
      setProfile(null);
      return;
    }

    const profileData = await getProfile(user.id);
    setProfile(profileData);
  };

  useEffect(() => {
    supabase
      .auth
      .getSession()
      // @ts-ignore
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          getProfile(session.user.id).then(setProfile);
        }
      })
      // @ts-ignore
      .catch(error => {
        console.error('Session load failed — check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY:', error.message);
      })
      .finally(() => {
        setLoading(false);
      });

    // @ts-ignore
    // In this function, do NOT use any await calls. Use `.then()` instead to avoid deadlocks.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        getProfile(session.user.id).then(setProfile);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Primary: sign in with real email + password
  const signIn = async (email: string, password: string) => {
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
      return { error: new Error('Supabase is not connected. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.') };
    }
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  // Primary: sign up with real email + password; username stored in metadata and profile
  const signUp = async (email: string, password: string, username: string) => {
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
      return { error: new Error('Supabase is not connected. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.') };
    }
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            display_name: username,
            agreed_to_terms: true,
            creator_memory_enabled: true,
          },
        },
      });
      if (error) throw error;

      // The trigger auto-creates the profile row with email.
      // Update it with username if the user exists (not email-confirmation pending).
      if (data.user && username) {
        await supabase
          .from('profiles')
          .update({ username })
          .eq('id', data.user.id);
      }

      // Detect email confirmation requirement: user created but session is null
      const emailConfirmRequired = !!data.user && !data.session;
      return { error: null, emailConfirmRequired };
    } catch (error) {
      return { error: error as Error, emailConfirmRequired: false };
    }
  };

  // Deprecated legacy aliases — kept so other parts of the app don't break
  const signInWithUsername = async (username: string, password: string) => {
    // Treat username as email for backward compatibility
    return signIn(username, password);
  };

  const signUpWithUsername = async (username: string, password: string) => {
    return signUp(username, password, '');
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signInWithUsername, signUpWithUsername, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
