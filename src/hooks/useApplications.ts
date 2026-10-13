import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  addDoc,
  collection,
  deleteDoc,
  updateDoc,
  doc,
  getDocs,
  orderBy,
  query,
  writeBatch,
  WriteBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { JobApplication, ApplicationFormData, ApplicationStatus } from '@/types/application';
import { toast } from 'sonner';

// Firestore batches are limited to 500 writes
const BATCH_LIMIT = 450;

const appsCollection = (uid: string) => collection(db, 'users', uid, 'applications');

/** Turn empty strings / undefined into null so Firestore stores clean values. */
const clean = (value: unknown) => (value === '' || value === undefined ? null : value);

const OPTIONAL_FIELDS = [
  'job_description',
  'job_url',
  'job_type',
  'location',
  'salary_min',
  'salary_max',
  'salary_currency',
  'notes',
  'follow_up_date',
  'response_date',
] as const;

function toCreateDoc(data: ApplicationFormData, uid: string) {
  const now = new Date().toISOString();
  const record: Record<string, unknown> = {
    user_id: uid,
    company_name: data.company_name.trim(),
    position_title: data.position_title.trim(),
    status: data.status || 'applied',
    applied_date: data.applied_date || now.split('T')[0],
    created_at: now,
    updated_at: now,
  };
  for (const field of OPTIONAL_FIELDS) {
    record[field] = clean(data[field]);
  }
  return record;
}

function toUpdateDoc(data: Partial<ApplicationFormData>) {
  const record: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined && !(OPTIONAL_FIELDS as readonly string[]).includes(key)) continue;
    if (key === 'applied_date' && !value) continue; // keep the existing date if the field was cleared
    record[key] = (OPTIONAL_FIELDS as readonly string[]).includes(key) ? clean(value) : value;
  }
  return record;
}

async function commitInChunks(ids: string[], apply: (batch: WriteBatch, id: string) => void) {
  for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    ids.slice(i, i + BATCH_LIMIT).forEach((id) => apply(batch, id));
    await batch.commit();
  }
}

export function useApplications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const queryKey = ['applications', user?.uid];

  const { data: applications = [], isLoading: loading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!user) return [];
      const snap = await getDocs(query(appsCollection(user.uid), orderBy('applied_date', 'desc')));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as JobApplication);
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async (data: ApplicationFormData) => {
      if (!user) throw new Error('Not authenticated');
      await addDoc(appsCollection(user.uid), toCreateDoc(data, user.uid));
    },
    onSuccess: () => {
      toast.success('Application added successfully');
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ApplicationFormData> }) => {
      if (!user) throw new Error('Not authenticated');
      await updateDoc(doc(appsCollection(user.uid), id), toUpdateDoc(data));
    },
    onSuccess: () => {
      toast.success('Application updated successfully');
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Not authenticated');
      await deleteDoc(doc(appsCollection(user.uid), id));
    },
    onSuccess: () => {
      toast.success('Application deleted');
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!user) throw new Error('Not authenticated');
      await commitInChunks(ids, (batch, id) => batch.delete(doc(appsCollection(user.uid), id)));
      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} applications deleted`);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const bulkUpdateStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: ApplicationStatus }) => {
      if (!user) throw new Error('Not authenticated');
      const updated_at = new Date().toISOString();
      await commitInChunks(ids, (batch, id) =>
        batch.update(doc(appsCollection(user.uid), id), { status, updated_at })
      );
      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} applications updated`);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const wrap =
    <A extends unknown[]>(fn: (...args: A) => Promise<unknown>) =>
    async (...args: A) => {
      try {
        await fn(...args);
        return { error: null };
      } catch (err) {
        return { error: err as Error };
      }
    };

  return {
    applications,
    loading,
    error: error?.message ?? null,
    createApplication: wrap((data: ApplicationFormData) => createMutation.mutateAsync(data)),
    updateApplication: wrap((id: string, data: Partial<ApplicationFormData>) =>
      updateMutation.mutateAsync({ id, data })
    ),
    deleteApplication: wrap((id: string) => deleteMutation.mutateAsync(id)),
    bulkDelete: wrap((ids: string[]) => bulkDeleteMutation.mutateAsync(ids)),
    bulkUpdateStatus: wrap((ids: string[], status: ApplicationStatus) =>
      bulkUpdateStatusMutation.mutateAsync({ ids, status })
    ),
    refetch: () => queryClient.invalidateQueries({ queryKey }),
  };
}
