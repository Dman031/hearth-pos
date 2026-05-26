import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';

interface AuthResult {
  error: Error | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  signInWithApple: () => Promise<AuthResult>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error('[AuthProvider] getSession failed:', error);
      }
      if (!mounted) {
        return;
      }
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const signIn = async (
      email: string,
      password: string,
    ): Promise<AuthResult> => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        console.error('[AuthProvider] signIn failed:', error);
      }
      return { error };
    };

    const signUp = async (
      email: string,
      password: string,
    ): Promise<AuthResult> => {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        console.error('[AuthProvider] signUp failed:', error);
      }
      return { error };
    };

    const signOut = async (): Promise<AuthResult> => {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('[AuthProvider] signOut failed:', error);
      }
      return { error };
    };

    const signInWithGoogle = async (): Promise<AuthResult> => {
      console.log('TODO Day 1.1: Google sign-in not yet configured');
      return { error: new Error('Sign-in provider not yet configured') };
    };

    const signInWithApple = async (): Promise<AuthResult> => {
      console.log('TODO Day 1.1: Apple sign-in not yet configured');
      return { error: new Error('Sign-in provider not yet configured') };
    };

    return {
      user,
      session,
      isLoading,
      signIn,
      signUp,
      signOut,
      signInWithGoogle,
      signInWithApple,
    };
  }, [user, session, isLoading]);

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error(
      '[AuthContext] useAuth must be used inside <AuthProvider>',
    );
  }
  return ctx;
}
