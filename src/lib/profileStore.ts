import type { User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firestore';
import type { Profile } from '@/hooks/useProfile';

/**
 * Reads users/{uid}; on the very first sign-in the document doesn't exist yet, so create it
 * (replaces the old Supabase `handle_new_user` trigger). One read per session instead of two.
 */
export async function fetchOrCreateProfile(user: User): Promise<Profile> {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return { id: snap.id, ...snap.data() } as Profile;

  const now = new Date().toISOString();
  const created = {
    user_id: user.uid,
    email: user.email ?? null,
    full_name: null,
    phone: null,
    resume_url: null,
    skills: null,
    preferred_currency: 'INR',
    created_at: now,
    updated_at: now,
  };
  await setDoc(ref, created);
  return { id: user.uid, ...created };
}

export async function updateProfileDoc(uid: string, update: Record<string, unknown>) {
  await updateDoc(doc(db, 'users', uid), update);
}
