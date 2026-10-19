import type { User } from 'firebase/auth';

/**
 * Shared by useProfile and the auth provider (which starts the read as soon as the user is known).
 * TanStack Query de-duplicates it, so every component asking for the profile shares one Firestore read.
 * The Firestore code is loaded on demand, so signed-out pages never download it.
 */
export const profileQueryKey = (uid: string | undefined) => ['profile', uid] as const;

export const profileQueryOptions = (user: User | null) => ({
  queryKey: profileQueryKey(user?.uid),
  queryFn: async () => {
    if (!user) return null;
    const { fetchOrCreateProfile } = await import('@/lib/profileStore');
    return fetchOrCreateProfile(user);
  },
  enabled: !!user,
  staleTime: Infinity, // Profile rarely changes, keep it cached indefinitely
});
