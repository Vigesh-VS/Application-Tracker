import { ApplicationStatus, JobType, STATUS_CONFIG, JOB_TYPE_CONFIG } from '@/types/application';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, X } from 'lucide-react';

interface Filters {
  search: string;
  status: ApplicationStatus | 'all';
  jobType: JobType | 'all';
}

interface ApplicationFiltersProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
}

export function ApplicationFilters({ filters, onFiltersChange }: ApplicationFiltersProps) {
  const hasActiveFilters = filters.search || filters.status !== 'all' || filters.jobType !== 'all';

  const clearFilters = () => {
    onFiltersChange({ search: '', status: 'all', jobType: 'all' });
  };

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
        <Input
          placeholder="Search by company or position..."
          value={filters.search}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          className="pl-9 bg-white/10 border-white/20 text-white placeholder:text-white/50"
        />
      </div>

      <Select
        value={filters.status}
        onValueChange={(value: ApplicationStatus | 'all') => 
          onFiltersChange({ ...filters, status: value })
        }
      >
        <SelectTrigger className="w-full sm:w-40 bg-white/10 border-white/20 text-white">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent className="bg-black/95 border-white/20">
          <SelectItem value="all" className="text-white hover:bg-white/10">All Status</SelectItem>
          {Object.entries(STATUS_CONFIG).map(([key, config]) => (
            <SelectItem key={key} value={key} className="text-white hover:bg-white/10">
              {config.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.jobType}
        onValueChange={(value: JobType | 'all') => 
          onFiltersChange({ ...filters, jobType: value })
        }
      >
        <SelectTrigger className="w-full sm:w-40 bg-white/10 border-white/20 text-white">
          <SelectValue placeholder="Job Type" />
        </SelectTrigger>
        <SelectContent className="bg-black/95 border-white/20">
          <SelectItem value="all" className="text-white hover:bg-white/10">All Types</SelectItem>
          {Object.entries(JOB_TYPE_CONFIG).map(([key, config]) => (
            <SelectItem key={key} value={key} className="text-white hover:bg-white/10">
              {config.icon} {config.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-white hover:bg-white/10">
          <X className="h-4 w-4" />
          Clear
        </Button>
      )}
    </div>
  );
}
