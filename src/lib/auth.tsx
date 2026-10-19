import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { useQueryClient } from '@tanstack/react-query';
import { auth, googleProvider } from '@/lib/firebase';
import { profileQueryOptions } from '@/lib/profileQuery';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    return onAuthStateChanged(auth, (firebaseUser) => {
      // Show the app right away; the profile (created on first sign-in) loads in the
      // background and is shared with every useProfile() caller.
      setUser(firebaseUser);
      setLoading(false);
      if (firebaseUser) {
        queryClient.prefetchQuery(profileQueryOptions(firebaseUser)).catch((err) => {
          if (import.meta.env.DEV) console.error('Could not load profile:', err);
        });
      }
    });
  }, [queryClient]);

  const signInWithGoogle = async () => {
    try {
      // Popup works on any domain (localhost, Vercel, custom) without redirect loops.
      await signInWithPopup(auth, googleProvider);
      return { error: null };
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return { error: new Error('Sign-in was cancelled') };
      }
      if (code === 'auth/unauthorized-domain') {
        return {
          error: new Error(
            'This domain is not authorised. Add it in Firebase console → Authentication → Settings → Authorized domains.'
          ),
        };
      }
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>
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
