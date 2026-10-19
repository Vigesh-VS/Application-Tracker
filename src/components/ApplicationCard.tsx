import { JobApplication, JOB_TYPE_CONFIG, ApplicationStatus, STATUS_CONFIG } from '@/types/application';
import { useCurrency } from '@/hooks/useCurrency';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Building2, 
  MapPin, 
  Calendar, 
  ExternalLink,
  MoreVertical,
  Edit,
  Trash2,
  ChevronDown
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { cn, safeExternalUrl } from '@/lib/utils';

interface ApplicationCardProps {
  application: JobApplication;
  selected: boolean;
  onSelect: (id: string) => void;
  onEdit: (application: JobApplication) => void;
  onDelete: (id: string) => void;
  onStatusChange?: (id: string, status: ApplicationStatus) => void;
}

export function ApplicationCard({ 
  application, 
  selected, 
  onSelect, 
  onEdit, 
  onDelete,
  onStatusChange
}: ApplicationCardProps) {
  const { formatSalary } = useCurrency();
  
  const salary = formatSalary(
    application.salary_min, 
    application.salary_max, 
    application.salary_currency
  );

  return (
    <Card className="group relative transition-all duration-200 hover:shadow-lg animate-fade-in bg-black/80 backdrop-blur-2xl border-white/20 hover:border-white/40">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={selected}
              onCheckedChange={() => onSelect(application.id)}
              className="mt-1 border-white/40 data-[state=checked]:bg-white data-[state=checked]:text-black"
            />
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-white truncate">
                {application.position_title}
              </h3>
              <div className="flex items-center gap-1.5 text-white/70 mt-1">
                <Building2 className="h-3.5 w-3.5" />
                <span className="text-sm truncate">{application.company_name}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors hover:opacity-80',
                  STATUS_CONFIG[application.status].bgColor,
                  STATUS_CONFIG[application.status].color
                )}>
                  {STATUS_CONFIG[application.status].label}
                  <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-50 bg-black/95 border-white/20">
                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                  <DropdownMenuItem
                    key={key}
                    onClick={() => onStatusChange?.(application.id, key as ApplicationStatus)}
                    className={cn(
                      "text-white hover:bg-white/10",
                      application.status === key && 'bg-white/10'
                    )}
                  >
                    <span className={cn('w-2 h-2 rounded-full mr-2', config.bgColor)} />
                    {config.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-white hover:bg-white/10">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-black/95 border-white/20">
                <DropdownMenuItem onClick={() => onEdit(application)} className="text-white hover:bg-white/10">
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => onDelete(application.id)}
                  className="text-red-400 focus:text-red-400 hover:bg-white/10"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="flex flex-wrap gap-3 text-sm text-white/70">
          {application.location && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              <span>{application.location}</span>
            </div>
          )}
          
          {application.job_type && (
            <div className="flex items-center gap-1.5">
              <span>{JOB_TYPE_CONFIG[application.job_type].icon}</span>
              <span>{JOB_TYPE_CONFIG[application.job_type].label}</span>
            </div>
          )}
          
          {salary && (
            <div className="flex items-center gap-1.5">
              <span>{salary}</span>
            </div>
          )}
          
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            <span>{format(new Date(application.applied_date), 'MMM d, yyyy')}</span>
          </div>
          
          {safeExternalUrl(application.job_url) && (
            <a
              href={safeExternalUrl(application.job_url)!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-white hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>View Job</span>
            </a>
          )}
        </div>
        
        {application.notes && (
          <p className="mt-3 text-sm text-white/60 line-clamp-2 border-t border-white/10 pt-3">
            {application.notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
