import { Users, UserPlus, Briefcase, TrendingUp } from 'lucide-react';
import { StatCard } from '@/components/StatCard';

interface AdminUserStatsProps {
  totalUsers: number;
  newUsersThisMonth: number;
  totalApplications: number;
  activeUsers: number;
}

export function AdminUserStats({ 
  totalUsers, 
  newUsersThisMonth, 
  totalApplications, 
  activeUsers 
}: AdminUserStatsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Total Users"
        value={totalUsers}
        icon={<Users className="h-5 w-5" />}
        description="Registered accounts"
      />
      <StatCard
        title="New This Month"
        value={newUsersThisMonth}
        icon={<UserPlus className="h-5 w-5" />}
        description="Recent signups"
      />
      <StatCard
        title="Total Applications"
        value={totalApplications}
        icon={<Briefcase className="h-5 w-5" />}
        description="Across all users"
      />
      <StatCard
        title="Active Users"
        value={activeUsers}
        icon={<TrendingUp className="h-5 w-5" />}
        description="Users with applications"
      />
    </div>
  );
}
