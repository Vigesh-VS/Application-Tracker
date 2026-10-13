import { ApplicationStatus, STATUS_CONFIG } from '@/types/application';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Trash2, CheckSquare, X } from 'lucide-react';

interface BulkActionsProps {
  selectedCount: number;
  onStatusChange: (status: ApplicationStatus) => void;
  onDelete: () => void;
  onClearSelection: () => void;
}

export function BulkActions({ 
  selectedCount, 
  onStatusChange, 
  onDelete, 
  onClearSelection 
}: BulkActionsProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-3 p-3 bg-white/10 border border-white/20 rounded-lg animate-scale-in backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <CheckSquare className="h-4 w-4 text-white" />
        <span className="text-sm font-medium text-white">
          {selectedCount} selected
        </span>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <Select onValueChange={(value: ApplicationStatus) => onStatusChange(value)}>
          <SelectTrigger className="w-36 h-8 bg-white/10 border-white/20 text-white">
            <SelectValue placeholder="Change status" />
          </SelectTrigger>
          <SelectContent className="bg-black/95 border-white/20">
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key} className="text-white hover:bg-white/10">
                {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button 
          variant="destructive" 
          size="sm" 
          onClick={onDelete}
          className="gap-1.5"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>

        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onClearSelection}
          className="h-8 w-8 text-white hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
