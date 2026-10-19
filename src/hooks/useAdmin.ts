import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, collectionGroup, doc, getDoc, getDocs } from 'firebase/firestore';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firestore';
import type { ApplicationStatus } from '@/types/application';

export interface AdminUserStats {
  user_id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  total_applications: number;
  applied_count: number;
  interviewing_count: number;
  offered_count: number;
  rejected_count: number;
  withdrawn_count: number;
  pending_count: number;
  last_application_date: string | null;
}

/**
 * A user is an admin when a document exists at admins/{uid}.
 * Those documents can only be created from the Firebase console (see firestore.rules),
 * so users can never make themselves admin. Replaces the old is_admin() SQL function.
 */
export function useIsAdmin() {
  const { user } = useAuth();
  // Cached and shared: the dashboard and admin page (which asks twice) cause a single read per session
  const { data: isAdmin = false, isLoading } = useQuery({
    queryKey: ['isAdmin', user?.uid],
    queryFn: async () => {
      try {
        return (await getDoc(doc(db, 'admins', user!.uid))).exists();
      } catch (err) {
        if (import.meta.env.DEV) console.error('Error checking admin status:', err);
        return false;
      }
    },
    enabled: !!user,
    staleTime: Infinity,
  });

  return { isAdmin, loading: !!user && isLoading };
}

/** Same numbers as the old get_admin_user_stats() SQL function, computed from Firestore. */
async function fetchAdminStats(): Promise<AdminUserStats[]> {
  const [usersSnap, appsSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collectionGroup(db, 'applications')),
  ]);

  const stats = new Map<string, AdminUserStats>();
  usersSnap.forEach((d) => {
    const data = d.data();
    stats.set(d.id, {
      user_id: d.id,
      email: data.email ?? null,
      full_name: data.full_name ?? null,
      created_at: data.created_at ?? '',
      total_applications: 0,
      applied_count: 0,
      interviewing_count: 0,
      offered_count: 0,
      rejected_count: 0,
      withdrawn_count: 0,
      pending_count: 0,
      last_application_date: null,
    });
  });

  appsSnap.forEach((d) => {
    const ownerId = d.ref.parent.parent?.id;
    const row = ownerId ? stats.get(ownerId) : undefined;
    if (!row) return;
    const app = d.data() as { status: ApplicationStatus; applied_date?: string };
    row.total_applications++;
    const key = `${app.status}_count` as keyof AdminUserStats;
    if (key in row) (row[key] as number)++;
    if (app.applied_date && (!row.last_application_date || app.applied_date > row.last_application_date)) {
      row.last_application_date = app.applied_date;
    }
  });

  return [...stats.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function useAdminStats() {
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [stats, setStats] = useState<AdminUserStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await fetchAdminStats());
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error fetching admin stats:', err);
      setError('Failed to fetch user statistics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (adminLoading) return;
    if (!user || !isAdmin) {
      setLoading(false);
      return;
    }
    refetch();
  }, [user, isAdmin, adminLoading, refetch]);

  return { stats, loading, error, refetch };
}
