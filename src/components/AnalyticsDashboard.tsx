import { useMemo } from 'react';
import { JobApplication, STATUS_CONFIG, ApplicationStatus } from '@/types/application';
import { useCurrency } from '@/hooks/useCurrency';
import { formatCurrency } from '@/types/currency';
import { StatCard } from './StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { 
  FileText, 
  CheckCircle, 
  XCircle, 
  Clock,
  TrendingUp,
  Building2
} from 'lucide-react';
import { differenceInDays } from 'date-fns';

interface AnalyticsDashboardProps {
  applications: JobApplication[];
}

const CHART_COLORS = {
  applied: '#3b82f6',
  interviewing: '#f59e0b',
  offered: '#22c55e',
  rejected: '#ef4444',
  withdrawn: '#6b7280',
  pending: '#8b5cf6',
};

export function AnalyticsDashboard({ applications }: AnalyticsDashboardProps) {
  const { preferredCurrency } = useCurrency();
  const stats = useMemo(() => {
    const total = applications.length;
    const byStatus: Record<ApplicationStatus, number> = {
      applied: 0,
      interviewing: 0,
      offered: 0,
      rejected: 0,
      withdrawn: 0,
      pending: 0,
    };

    applications.forEach(app => {
      byStatus[app.status]++;
    });

    const offered = byStatus.offered;
    const rejected = byStatus.rejected;
    const responded = offered + rejected + byStatus.interviewing;
    
    const acceptanceRate = total > 0 ? ((offered / total) * 100).toFixed(1) : '0';
    const rejectionRate = total > 0 ? ((rejected / total) * 100).toFixed(1) : '0';
    const responseRate = total > 0 ? ((responded / total) * 100).toFixed(1) : '0';

    // Average response time
    const appsWithResponse = applications.filter(app => 
      app.response_date && app.applied_date
    );
    const avgResponseDays = appsWithResponse.length > 0
      ? Math.round(
          appsWithResponse.reduce((sum, app) => {
            return sum + differenceInDays(
              new Date(app.response_date!), 
              new Date(app.applied_date)
            );
          }, 0) / appsWithResponse.length
        )
      : null;

    // Company breakdown
    const byCompany: Record<string, number> = {};
    applications.forEach(app => {
      byCompany[app.company_name] = (byCompany[app.company_name] || 0) + 1;
    });
    const topCompanies = Object.entries(byCompany)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // Location breakdown
    const byLocation: Record<string, number> = {};
    applications.forEach(app => {
      if (app.location) {
        byLocation[app.location] = (byLocation[app.location] || 0) + 1;
      }
    });
    const topLocations = Object.entries(byLocation)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // Salary trends
    const appsWithSalary = applications.filter(app => app.salary_max);
    const avgSalary = appsWithSalary.length > 0
      ? Math.round(
          appsWithSalary.reduce((sum, app) => sum + (app.salary_max || 0), 0) / appsWithSalary.length
        )
      : null;

    return {
      total,
      byStatus,
      acceptanceRate,
      rejectionRate,
      responseRate,
      avgResponseDays,
      topCompanies,
      topLocations,
      avgSalary,
    };
  }, [applications]);

  const statusChartData = Object.entries(stats.byStatus).map(([status, count]) => ({
    name: STATUS_CONFIG[status as ApplicationStatus].label,
    value: count,
    status,
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Applications"
          value={stats.total}
          icon={<FileText className="h-5 w-5" />}
          description="All time applications"
        />
        <StatCard
          title="Offer Rate"
          value={`${stats.acceptanceRate}%`}
          icon={<CheckCircle className="h-5 w-5" />}
          description={`${stats.byStatus.offered} offers received`}
        />
        <StatCard
          title="Rejection Rate"
          value={`${stats.rejectionRate}%`}
          icon={<XCircle className="h-5 w-5" />}
          description={`${stats.byStatus.rejected} rejections`}
        />
        <StatCard
          title="Response Rate"
          value={`${stats.responseRate}%`}
          icon={<Clock className="h-5 w-5" />}
          description={stats.avgResponseDays ? `~${stats.avgResponseDays} days avg` : 'No data yet'}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline Chart */}
        <Card className="bg-black/80 backdrop-blur-2xl border-white/20">
          <CardHeader>
            <CardTitle className="font-display text-lg text-white">Application Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusChartData.filter(d => d.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {statusChartData.map((entry) => (
                      <Cell 
                        key={entry.status} 
                        fill={CHART_COLORS[entry.status as ApplicationStatus]} 
                      />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(0, 0, 0, 0.9)', 
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '8px',
                      color: 'white'
                    }}
                  />
                  <Legend wrapperStyle={{ color: 'white' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top Companies */}
        <Card className="bg-black/80 backdrop-blur-2xl border-white/20">
          <CardHeader>
            <CardTitle className="font-display text-lg flex items-center gap-2 text-white">
              <Building2 className="h-5 w-5" />
              Top Companies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {stats.topCompanies.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.topCompanies} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(255,255,255,0.1)" />
                    <XAxis type="number" stroke="rgba(255,255,255,0.5)" />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      width={100}
                      tick={{ fontSize: 12, fill: 'rgba(255,255,255,0.7)' }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'rgba(0, 0, 0, 0.9)', 
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: '8px',
                        color: 'white'
                      }}
                    />
                    <Bar 
                      dataKey="count" 
                      fill="#3b82f6" 
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-white/60">
                  No applications yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Active Pipeline */}
        <Card className="bg-black/80 backdrop-blur-2xl border-white/20">
          <CardHeader>
            <CardTitle className="font-display text-lg text-white">Active Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(stats.byStatus).map(([status, count]) => (
                <div key={status} className="flex items-center gap-3">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: CHART_COLORS[status as ApplicationStatus] }}
                  />
                  <span className="flex-1 text-sm text-white/80">
                    {STATUS_CONFIG[status as ApplicationStatus].label}
                  </span>
                  <span className="font-medium text-white">{count}</span>
                  <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all"
                      style={{ 
                        width: `${stats.total > 0 ? (count / stats.total) * 100 : 0}%`,
                        backgroundColor: CHART_COLORS[status as ApplicationStatus]
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Salary Insights */}
        <Card className="bg-black/80 backdrop-blur-2xl border-white/20">
          <CardHeader>
            <CardTitle className="font-display text-lg flex items-center gap-2 text-white">
              <TrendingUp className="h-5 w-5" />
              Salary Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.avgSalary ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-white/60">Average Salary Range</p>
                  <p className="text-2xl font-bold font-display text-white">
                    {formatCurrency(stats.avgSalary, preferredCurrency)}
                  </p>
                </div>
                {stats.topLocations.length > 0 && (
                  <div>
                    <p className="text-sm text-white/60 mb-2">Top Locations</p>
                    <div className="flex flex-wrap gap-2">
                      {stats.topLocations.map(loc => (
                        <span 
                          key={loc.name}
                          className="px-2 py-1 bg-white/10 text-white/80 rounded-full text-xs"
                        >
                          {loc.name} ({loc.count})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-white/60">
                Add salary data to see insights
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
