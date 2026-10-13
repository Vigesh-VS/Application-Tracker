import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface UserStats {
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

interface AdminUserTableProps {
  users: UserStats[];
  loading: boolean;
}

type SortField = 'email' | 'full_name' | 'created_at' | 'total_applications';
type SortDirection = 'asc' | 'desc';

export function AdminUserTable({ users, loading }: AdminUserTableProps) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const filteredAndSortedUsers = useMemo(() => {
    let filtered = users;

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = users.filter(user => 
        user.email?.toLowerCase().includes(searchLower) ||
        user.full_name?.toLowerCase().includes(searchLower)
      );
    }

    // Apply sorting
    return [...filtered].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortField) {
        case 'email':
          aValue = a.email || '';
          bValue = b.email || '';
          break;
        case 'full_name':
          aValue = a.full_name || '';
          bValue = b.full_name || '';
          break;
        case 'created_at':
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
          break;
        case 'total_applications':
          aValue = a.total_applications;
          bValue = b.total_applications;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [users, search, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-2 h-4 w-4 text-white/50" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="ml-2 h-4 w-4 text-white" />
      : <ArrowDown className="ml-2 h-4 w-4 text-white" />;
  };

  return (
    <Card className="bg-black/80 backdrop-blur-2xl border-white/20">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="text-white">Registered Users</CardTitle>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
            <Input
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white/10 border-white/20 text-white placeholder:text-white/50"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
          </div>
        ) : filteredAndSortedUsers.length === 0 ? (
          <div className="text-center py-8 text-white/60">
            {search ? 'No users match your search' : 'No users found'}
          </div>
        ) : (
          <div className="rounded-md border border-white/20 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-white/20 hover:bg-white/5">
                  <TableHead className="text-white/70">
                    <Button
                      variant="ghost"
                      className="h-auto p-0 font-medium hover:bg-transparent text-white/70 hover:text-white"
                      onClick={() => handleSort('email')}
                    >
                      Email
                      <SortIcon field="email" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-white/70">
                    <Button
                      variant="ghost"
                      className="h-auto p-0 font-medium hover:bg-transparent text-white/70 hover:text-white"
                      onClick={() => handleSort('full_name')}
                    >
                      Name
                      <SortIcon field="full_name" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-white/70">
                    <Button
                      variant="ghost"
                      className="h-auto p-0 font-medium hover:bg-transparent text-white/70 hover:text-white"
                      onClick={() => handleSort('created_at')}
                    >
                      Signed Up
                      <SortIcon field="created_at" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-white/70">
                    <Button
                      variant="ghost"
                      className="h-auto p-0 font-medium hover:bg-transparent text-white/70 hover:text-white"
                      onClick={() => handleSort('total_applications')}
                    >
                      Applications
                      <SortIcon field="total_applications" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-white/70">Status Breakdown</TableHead>
                  <TableHead className="text-white/70">Last Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedUsers.map((user) => (
                  <TableRow key={user.user_id} className="border-white/10 hover:bg-white/5">
                    <TableCell className="font-medium text-white">
                      {user.email || '-'}
                    </TableCell>
                    <TableCell className="text-white/80">
                      {user.full_name || '-'}
                    </TableCell>
                    <TableCell className="text-white/80">
                      {format(new Date(user.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-white">{user.total_applications}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.applied_count > 0 && (
                          <Badge variant="secondary" className="text-xs bg-white/10 text-white/80">
                            {user.applied_count} Applied
                          </Badge>
                        )}
                        {user.interviewing_count > 0 && (
                          <Badge className="bg-blue-500/20 text-blue-300 hover:bg-blue-500/20 text-xs">
                            {user.interviewing_count} Interview
                          </Badge>
                        )}
                        {user.offered_count > 0 && (
                          <Badge className="bg-green-500/20 text-green-300 hover:bg-green-500/20 text-xs">
                            {user.offered_count} Offered
                          </Badge>
                        )}
                        {user.rejected_count > 0 && (
                          <Badge className="bg-red-500/20 text-red-300 hover:bg-red-500/20 text-xs">
                            {user.rejected_count} Rejected
                          </Badge>
                        )}
                        {user.pending_count > 0 && (
                          <Badge className="bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/20 text-xs">
                            {user.pending_count} Pending
                          </Badge>
                        )}
                        {user.withdrawn_count > 0 && (
                          <Badge variant="outline" className="text-xs border-white/20 text-white/70">
                            {user.withdrawn_count} Withdrawn
                          </Badge>
                        )}
                        {user.total_applications === 0 && (
                          <span className="text-white/50 text-sm">None</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-white/80">
                      {user.last_application_date 
                        ? format(new Date(user.last_application_date), 'MMM d, yyyy')
                        : '-'
                      }
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
