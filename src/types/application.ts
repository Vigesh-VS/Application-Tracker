export type ApplicationStatus = 'applied' | 'interviewing' | 'offered' | 'rejected' | 'withdrawn' | 'pending';
export type JobType = 'remote' | 'hybrid' | 'onsite';

export interface JobApplication {
  id: string;
  user_id: string;
  company_name: string;
  position_title: string;
  job_description?: string | null;
  job_url?: string | null;
  status: ApplicationStatus;
  job_type?: JobType | null;
  location?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  notes?: string | null;
  applied_date: string;
  follow_up_date?: string | null;
  response_date?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplicationFormData {
  company_name: string;
  position_title: string;
  job_description?: string;
  job_url?: string;
  status: ApplicationStatus;
  job_type?: JobType;
  location?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  notes?: string;
  applied_date: string;
  follow_up_date?: string;
  response_date?: string;
}

export const STATUS_CONFIG: Record<ApplicationStatus, { label: string; color: string; bgColor: string }> = {
  applied: { label: 'Applied', color: 'text-info', bgColor: 'bg-info/10' },
  interviewing: { label: 'Interviewing', color: 'text-warning', bgColor: 'bg-warning/10' },
  offered: { label: 'Offered', color: 'text-success', bgColor: 'bg-success/10' },
  rejected: { label: 'Rejected', color: 'text-destructive', bgColor: 'bg-destructive/10' },
  withdrawn: { label: 'Withdrawn', color: 'text-muted-foreground', bgColor: 'bg-muted' },
  pending: { label: 'Pending', color: 'text-accent', bgColor: 'bg-accent/10' },
};

export const JOB_TYPE_CONFIG: Record<JobType, { label: string; icon: string }> = {
  remote: { label: 'Remote', icon: '🏠' },
  hybrid: { label: 'Hybrid', icon: '🔄' },
  onsite: { label: 'On-site', icon: '🏢' },
};
