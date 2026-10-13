import { useMemo } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useIsAdmin, useAdminStats } from '@/hooks/useAdmin';
import { PageLayout } from '@/components/PageLayout';
import { AdminUserStats } from '@/components/AdminUserStats';
import { AdminUserTable } from '@/components/AdminUserTable';
import { Button } from '@/components/ui/button';
import { Briefcase, ArrowLeft, Loader2, ShieldAlert, RefreshCw } from 'lucide-react';

export default function AdminDashboard() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { stats, loading: statsLoading, refetch } = useAdminStats();

  const summaryStats = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const totalUsers = stats.length;
    const newUsersThisMonth = stats.filter(
      user => new Date(user.created_at) >= startOfMonth
    ).length;
    const totalApplications = stats.reduce(
      (sum, user) => sum + user.total_applications, 
      0
    );
    const activeUsers = stats.filter(
      user => user.total_applications > 0
    ).length;

    return { totalUsers, newUsersThisMonth, totalApplications, activeUsers };
  }, [stats]);

  // Loading state
  if (authLoading || adminLoading) {
    return (
      <PageLayout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
        </div>
      </PageLayout>
    );
  }

  // Not authenticated
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Not an admin
  if (!isAdmin) {
    return (
      <PageLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center space-y-4 p-8">
            <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
              <ShieldAlert className="h-8 w-8 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold font-display text-white">Access Denied</h1>
            <p className="text-white/70 max-w-md">
              You don't have permission to access the admin dashboard. 
              Please contact an administrator if you believe this is an error.
            </p>
            <Link to="/dashboard">
              <Button className="mt-4 gradient-primary">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Return to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-2xl border-b border-white/20">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg gradient-primary">
              <Briefcase className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display font-bold text-xl text-white">Admin Dashboard</h1>
              <p className="text-xs text-white/70">User Management</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={refetch}
              disabled={statsLoading}
              className="bg-white/10 border-white/20 text-white hover:bg-white/20"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${statsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Link to="/dashboard">
              <Button variant="ghost" size="sm" className="text-white hover:bg-white/10">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 space-y-6">
        <AdminUserStats 
          totalUsers={summaryStats.totalUsers}
          newUsersThisMonth={summaryStats.newUsersThisMonth}
          totalApplications={summaryStats.totalApplications}
          activeUsers={summaryStats.activeUsers}
        />
        
        <AdminUserTable users={stats} loading={statsLoading} />
      </main>
    </PageLayout>
  );
}
