import { useProfile } from './useProfile';

export function useProfileCompletion() {
  const { profile, loading } = useProfile();

  const isProfileComplete = Boolean(
    profile?.full_name && profile.full_name.trim() !== ''
  );

  return {
    isProfileComplete,
    loading,
    profile,
  };
}
