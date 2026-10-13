import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '@/lib/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Replaces the old Supabase `handle_new_user` trigger: the first time a user
 * signs in, create their profile document at users/{uid}.
 */
async function ensureProfile(user: User) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  const now = new Date().toISOString();
  await setDoc(ref, {
    user_id: user.uid,
    email: user.email ?? null,
    full_name: null,
    phone: null,
    resume_url: null,
    skills: null,
    preferred_currency: 'INR',
    created_at: now,
    updated_at: now,
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          await ensureProfile(firebaseUser);
        } catch (err) {
          if (import.meta.env.DEV) console.error('Could not create profile:', err);
        }
      }
      setUser(firebaseUser);
      setLoading(false);
    });
  }, []);

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
