import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

export interface Profile {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  resume_url: string | null;
  skills: string[] | null;
  preferred_currency: string;
  created_at: string;
  updated_at: string;
}

export interface ProfileFormData {
  full_name?: string | null;
  phone?: string | null;
  resume_url?: string | null;
  skills?: string[] | null;
  preferred_currency?: string;
}

export function useProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const queryKey = ['profile', user?.uid];

  const { data: profile = null, isLoading: loading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!user) return null;
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as Profile;
    },
    enabled: !!user,
    staleTime: Infinity, // Profile rarely changes, keep it cached indefinitely
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      if (!user) throw new Error('Not authenticated');

      // Only write the fields that were actually provided, so saving the
      // name/currency form never wipes phone, resume URL or skills.
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if ('full_name' in data) update.full_name = data.full_name?.trim() || null;
      if ('phone' in data) update.phone = data.phone || null;
      if ('resume_url' in data) update.resume_url = data.resume_url || null;
      if ('skills' in data) update.skills = data.skills && data.skills.length > 0 ? data.skills : null;
      if ('preferred_currency' in data) update.preferred_currency = data.preferred_currency || 'INR';

      await updateDoc(doc(db, 'users', user.uid), update);
      return update;
    },
    onSuccess: (update) => {
      toast.success('Profile updated successfully');
      queryClient.setQueryData(queryKey, (old: Profile | null) =>
        old ? ({ ...old, ...update } as Profile) : old
      );
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const updateProfile = async (data: ProfileFormData) => {
    try {
      await updateMutation.mutateAsync(data);
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  return {
    profile,
    loading,
    error: error?.message ?? null,
    updateProfile,
    refetch: () => queryClient.invalidateQueries({ queryKey }),
  };
}
