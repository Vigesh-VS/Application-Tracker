import { useState, useMemo } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useApplications } from '@/hooks/useApplications';
import { useIsAdmin } from '@/hooks/useAdmin';
import { useProfileCompletion } from '@/hooks/useProfileCompletion';
import { useProfile } from '@/hooks/useProfile';
import { PageLayout } from '@/components/PageLayout';
import { ApplicationCard } from '@/components/ApplicationCard';
import { ApplicationForm } from '@/components/ApplicationForm';
import { ApplicationFilters } from '@/components/ApplicationFilters';
import { BulkActions } from '@/components/BulkActions';
import { AnalyticsDashboard } from '@/components/AnalyticsDashboard';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Plus, 
  Loader2, 
  ClipboardList, 
  LogOut,
  LayoutDashboard,
  List,
  BarChart3,
  User,
  Shield,
  Home
} from 'lucide-react';
import { JobApplication, ApplicationStatus, JobType, ApplicationFormData } from '@/types/application';

interface Filters {
  search: string;
  status: ApplicationStatus | 'all';
  jobType: JobType | 'all';
}

export default function Dashboard() {
  const { user, signOut, loading: authLoading } = useAuth();
  const { isAdmin } = useIsAdmin();
  const { isProfileComplete, loading: profileLoading } = useProfileCompletion();
  const { profile } = useProfile();
  const { 
    applications, 
    loading, 
    createApplication, 
    updateApplication, 
    deleteApplication,
    bulkDelete,
    bulkUpdateStatus 
  } = useApplications();

  const [formOpen, setFormOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<JobApplication | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>({
    search: '',
    status: 'all',
    jobType: 'all',
  });

  const filteredApplications = useMemo(() => {
    return applications.filter(app => {
      // Search filter
      if (filters.search) {
        const search = filters.search.toLowerCase();
        const matchesSearch = 
          app.company_name.toLowerCase().includes(search) ||
          app.position_title.toLowerCase().includes(search) ||
          app.location?.toLowerCase().includes(search);
        if (!matchesSearch) return false;
      }

      // Status filter
      if (filters.status !== 'all' && app.status !== filters.status) {
        return false;
      }

      // Job type filter
      if (filters.jobType !== 'all' && app.job_type !== filters.jobType) {
        return false;
      }

      return true;
    });
  }, [applications, filters]);

  if (authLoading || profileLoading) {
    return (
      <PageLayout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
        </div>
      </PageLayout>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Redirect to profile if profile is incomplete
  if (!isProfileComplete) {
    return <Navigate to="/profile" replace state={{ requireCompletion: true }} />;
  }

  const handleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleEdit = (app: JobApplication) => {
    setEditingApp(app);
    setFormOpen(true);
  };

  const handleFormSubmit = async (data: ApplicationFormData) => {
    if (editingApp) {
      return updateApplication(editingApp.id, data);
    }
    return createApplication(data);
  };

  const handleFormClose = (open: boolean) => {
    setFormOpen(open);
    if (!open) {
      setEditingApp(null);
    }
  };

  const handleBulkDelete = async () => {
    await bulkDelete(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  const handleBulkStatusChange = async (status: ApplicationStatus) => {
    await bulkUpdateStatus(Array.from(selectedIds), status);
    setSelectedIds(new Set());
  };

  const handleStatusChange = async (id: string, status: ApplicationStatus) => {
    await updateApplication(id, { status });
  };

  return (
    <PageLayout>
      {/* Padding wrapper - shows background around edges */}
      <div className="p-4 md:p-8 min-h-screen">
        {/* Glassmorphic container box */}
        <div className="max-w-6xl mx-auto bg-black/80 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden min-h-[calc(100vh-4rem)]">
          
          {/* Header - inside container */}
          <header className="sticky top-0 z-50 bg-black/60 backdrop-blur-xl border-b border-white/10">
            <div className="px-4 md:px-6 py-4 flex items-center justify-between">
              <Link 
                to="/" 
                className="flex items-center gap-2 group"
              >
                <div className="p-2 rounded-lg bg-white/20 transition-transform duration-300 group-hover:scale-110">
                  <ClipboardList className="h-5 w-5 text-white" />
                </div>
                <span className="font-display font-bold text-lg text-white">Application Tracker</span>
              </Link>
              
              <div className="flex items-center gap-3">
              <Link to="/">
                  <Button variant="ghost" size="icon" className="rounded-full text-white hover:bg-white/10">
                    <Home className="h-4 w-4" />
                  </Button>
                </Link>
                {isAdmin && (
                  <Link to="/admin">
                    <Button variant="outline" size="sm" className="gap-2 bg-white/10 border-white/20 text-white hover:bg-white/20">
                      <Shield className="h-4 w-4" />
                      <span className="hidden sm:inline">Admin</span>
                    </Button>
                  </Link>
                )}
                <Link to="/profile">
                  <Button variant="ghost" size="icon" className="rounded-full text-white hover:bg-white/10">
                    <User className="h-4 w-4" />
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={signOut} className="gap-2 text-white hover:bg-white/10">
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Sign Out</span>
                </Button>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="p-4 md:p-6">
        <Tabs defaultValue="applications" className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <TabsList className="grid w-full sm:w-auto grid-cols-2 bg-black/80 backdrop-blur-2xl border border-white/20">
              <TabsTrigger value="applications" className="gap-2 text-white data-[state=active]:bg-white/20 data-[state=active]:text-white">
                <List className="h-4 w-4" />
                <span className="hidden sm:inline">Applications</span>
              </TabsTrigger>
              <TabsTrigger value="analytics" className="gap-2 text-white data-[state=active]:bg-white/20 data-[state=active]:text-white">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Analytics</span>
              </TabsTrigger>
            </TabsList>

            <Button 
              onClick={() => setFormOpen(true)} 
              className="gradient-primary shadow-primary gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Application
            </Button>
          </div>

          {/* Applications Tab */}
          <TabsContent value="applications" className="space-y-4">
            <ApplicationFilters filters={filters} onFiltersChange={setFilters} />
            
            <BulkActions
              selectedCount={selectedIds.size}
              onStatusChange={handleBulkStatusChange}
              onDelete={handleBulkDelete}
              onClearSelection={() => setSelectedIds(new Set())}
            />

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              </div>
            ) : filteredApplications.length === 0 ? (
              <div className="text-center py-12">
                <div className="p-4 rounded-full bg-white/10 inline-block mb-4">
                  <LayoutDashboard className="h-8 w-8 text-white/70" />
                </div>
                <h3 className="font-display font-semibold text-lg mb-2 text-white">
                  {applications.length === 0 ? 'No applications yet' : 'No matches found'}
                </h3>
                <p className="text-white/70 mb-4">
                  {applications.length === 0 
                    ? 'Start tracking your job hunt by adding your first application.'
                    : 'Try adjusting your filters to find what you\'re looking for.'
                  }
                </p>
                {applications.length === 0 && (
                  <Button onClick={() => setFormOpen(true)} className="gradient-primary shadow-primary gap-2">
                    <Plus className="h-4 w-4" />
                    Add Your First Application
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid gap-4">
                {filteredApplications.map(app => (
                  <ApplicationCard
                    key={app.id}
                    application={app}
                    selected={selectedIds.has(app.id)}
                    onSelect={handleSelect}
                    onEdit={handleEdit}
                    onDelete={deleteApplication}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics">
            <AnalyticsDashboard applications={applications} />
          </TabsContent>
        </Tabs>

        {/* Application Form Modal */}
        <ApplicationForm
          open={formOpen}
          onOpenChange={handleFormClose}
          onSubmit={handleFormSubmit}
          initialData={editingApp}
        />
      </main>
        </div>
      </div>
    </PageLayout>
  );
}
