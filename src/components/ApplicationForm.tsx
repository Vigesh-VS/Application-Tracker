import { useState, useEffect } from 'react';
import { JobApplication, ApplicationFormData, ApplicationStatus, JobType } from '@/types/application';
import { CURRENCY_OPTIONS, CurrencyCode } from '@/types/currency';
import { useCurrency } from '@/hooks/useCurrency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Link2, Sparkles, ClipboardPaste } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { CURRENCIES } from '@/types/currency';

interface ImportedJob {
  company_name?: string | null;
  position_title?: string | null;
  job_description?: string | null;
  job_url?: string | null;
  job_type?: JobType | null;
  location?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
}

interface ApplicationFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ApplicationFormData) => Promise<{ error: Error | null }>;
  initialData?: JobApplication | null;
}

export function ApplicationForm({ open, onOpenChange, onSubmit, initialData }: ApplicationFormProps) {
  const { toast } = useToast();
  const { preferredCurrency } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  // "Paste text" fallback for pages that can't be read automatically (login walls, JavaScript-only sites)
  const [pasteMode, setPasteMode] = useState(false);
  const [importText, setImportText] = useState('');
  const [formData, setFormData] = useState<ApplicationFormData>({
    company_name: initialData?.company_name || '',
    position_title: initialData?.position_title || '',
    job_description: initialData?.job_description || '',
    job_url: initialData?.job_url || '',
    status: initialData?.status || 'applied',
    job_type: initialData?.job_type || undefined,
    location: initialData?.location || '',
    salary_min: initialData?.salary_min || undefined,
    salary_max: initialData?.salary_max || undefined,
    salary_currency: initialData?.salary_currency || undefined,
    notes: initialData?.notes || '',
    applied_date: initialData?.applied_date || new Date().toISOString().split('T')[0],
    follow_up_date: initialData?.follow_up_date || '',
    response_date: initialData?.response_date || '',
  });

  useEffect(() => {
    if (open) {
      if (initialData) {
        setFormData({
          company_name: initialData.company_name || '',
          position_title: initialData.position_title || '',
          job_description: initialData.job_description || '',
          job_url: initialData.job_url || '',
          status: initialData.status || 'applied',
          job_type: initialData.job_type || undefined,
          location: initialData.location || '',
          salary_min: initialData.salary_min || undefined,
          salary_max: initialData.salary_max || undefined,
          salary_currency: initialData.salary_currency || undefined,
          notes: initialData.notes || '',
          applied_date: initialData.applied_date || new Date().toISOString().split('T')[0],
          follow_up_date: initialData.follow_up_date || '',
          response_date: initialData.response_date || '',
        });
      } else {
        setFormData({
          company_name: '',
          position_title: '',
          job_description: '',
          job_url: '',
          status: 'applied',
          job_type: undefined,
          location: '',
          salary_min: undefined,
          salary_max: undefined,
          salary_currency: undefined,
          notes: '',
          applied_date: new Date().toISOString().split('T')[0],
          follow_up_date: '',
          response_date: '',
        });
      }
    }
  }, [initialData, open]);

  const resetImport = () => {
    setShowUrlInput(false);
    setPasteMode(false);
    setImportUrl('');
    setImportText('');
  };

  const handleExtractFromUrl = async () => {
    if (pasteMode ? !importText.trim() : !importUrl.trim()) {
      toast({
        title: pasteMode ? "Text required" : "URL required",
        description: pasteMode ? "Please paste the job description" : "Please enter a job posting URL",
        variant: "destructive",
      });
      return;
    }

    setExtracting(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error('Please sign in to import from a URL');
      }

      let response: Response;
      try {
        response = await fetch('/api/extract-job-details', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify(pasteMode ? { text: importText, url: importUrl || undefined } : { url: importUrl }),
        });
      } catch {
        throw new Error("Couldn't reach the import service. Check your internet connection.");
      }

      let result: { success?: boolean; error?: string; code?: string; data?: ImportedJob } | null = null;
      try {
        result = await response.json();
      } catch {
        throw new Error(`Import service unavailable (HTTP ${response.status})`);
      }

      if (!response.ok || !result?.success || !result.data) {
        // The page can't be read automatically: switch to the paste-text fallback, keeping the URL
        if (result?.code === 'needs_text' && !pasteMode) setPasteMode(true);
        throw new Error(result?.error || 'Failed to extract job details');
      }

      const data = result.data;
      setFormData(prev => ({
        ...prev,
        company_name: data.company_name || prev.company_name,
        position_title: data.position_title || prev.position_title,
        job_description: data.job_description || prev.job_description,
        job_url: data.job_url || prev.job_url,
        job_type: data.job_type || prev.job_type,
        location: data.location || prev.location,
        salary_min: data.salary_min || prev.salary_min,
        salary_max: data.salary_max || prev.salary_max,
        salary_currency:
          data.salary_currency && data.salary_currency in CURRENCIES
            ? data.salary_currency
            : prev.salary_currency,
      }));

      toast({
        title: "Success!",
        description: "Job details extracted and filled in",
      });

      resetImport();
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error extracting job details:', error);
      toast({
        title: "Extraction failed",
        description: error instanceof Error ? error.message : "Could not extract job details",
        variant: "destructive",
      });
    } finally {
      setExtracting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const { error } = await onSubmit(formData);
    
    setLoading(false);
    if (!error) {
      onOpenChange(false);
      if (!initialData) {
        setFormData({
          company_name: '',
          position_title: '',
          job_description: '',
          job_url: '',
          status: 'applied',
          job_type: undefined,
          location: '',
          salary_min: undefined,
          salary_max: undefined,
          salary_currency: undefined,
          notes: '',
          applied_date: new Date().toISOString().split('T')[0],
          follow_up_date: '',
          response_date: '',
        });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {initialData ? 'Edit Application' : 'Add New Application'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Import from URL Section */}
          {!initialData && (
          <div className="bg-gradient-to-r from-indigo-500/20 via-blue-500/15 to-purple-500/20 border border-indigo-400/30 rounded-xl p-5 shadow-[0_0_15px_rgba(99,102,241,0.15)]">
              {!showUrlInput ? (
                <div className="flex flex-col items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowUrlInput(true)}
                    className="w-full gap-2 border-indigo-400/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-foreground font-semibold text-base py-5"
                  >
                    <Link2 className="h-5 w-5" />
                    Import from URL
                    <Sparkles className="h-5 w-5 text-indigo-400 animate-pulse" />
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Paste a LinkedIn, Indeed, or any job URL (or the job description) to auto-fill the form
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <Label htmlFor={pasteMode ? 'import_text' : 'import_url'} className="text-sm font-medium">
                    {pasteMode ? 'Paste the job description' : 'Paste job posting URL'}
                  </Label>
                  {pasteMode && (
                    <Textarea
                      id="import_text"
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      placeholder="Copy the whole job posting (title, company, location, salary, description) and paste it here..."
                      rows={6}
                      className="border-indigo-400/30 bg-indigo-500/5"
                      disabled={extracting}
                    />
                  )}
                  <div className="flex gap-2">
                    <Input
                      id="import_url"
                      type="url"
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      placeholder={pasteMode ? 'Job URL (optional, saved with the application)' : 'https://linkedin.com/jobs/...'}
                      className="flex-1 border-indigo-400/30 bg-indigo-500/5"
                      disabled={extracting}
                    />
                    <Button
                      type="button"
                      onClick={handleExtractFromUrl}
                      disabled={extracting}
                      className="gap-2 bg-indigo-500/80 hover:bg-indigo-500 text-white"
                    >
                      {extracting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Extracting...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          Extract
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={resetImport}
                      className="text-muted-foreground"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setPasteMode(!pasteMode)}
                      disabled={extracting}
                      className="gap-1.5 text-muted-foreground"
                    >
                      {pasteMode ? <Link2 className="h-4 w-4" /> : <ClipboardPaste className="h-4 w-4" />}
                      {pasteMode ? 'Use a URL instead' : 'Paste job description instead'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The job page or pasted text is sent to Google Gemini to read it. Google's free tier may use it to
                    improve its models, so don't include private information.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company_name">Company Name *</Label>
              <Input
                id="company_name"
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                required
                placeholder="Google, Apple, etc."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="position_title">Position Title *</Label>
              <Input
                id="position_title"
                value={formData.position_title}
                onChange={(e) => setFormData({ ...formData, position_title: e.target.value })}
                required
                placeholder="Software Engineer"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value: ApplicationStatus) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger className="pointer-events-auto">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent className="pointer-events-auto z-[100]">
                  <SelectItem value="applied">Applied</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="interviewing">Interviewing</SelectItem>
                  <SelectItem value="offered">Offered</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="withdrawn">Withdrawn</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="job_type">Job Type</Label>
              <Select
                value={formData.job_type || ''}
                onValueChange={(value: JobType) => setFormData({ ...formData, job_type: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="remote">🏠 Remote</SelectItem>
                  <SelectItem value="hybrid">🔄 Hybrid</SelectItem>
                  <SelectItem value="onsite">🏢 On-site</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={formData.location || ''}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="San Francisco, CA"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="job_url">Job URL</Label>
              <Input
                id="job_url"
                type="url"
                value={formData.job_url || ''}
                onChange={(e) => setFormData({ ...formData, job_url: e.target.value })}
                placeholder="https://..."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="salary_min">Salary Min</Label>
              <Input
                id="salary_min"
                type="number"
                value={formData.salary_min || ''}
                onChange={(e) => setFormData({ ...formData, salary_min: e.target.value ? parseInt(e.target.value) : undefined })}
                placeholder="500000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="salary_max">Salary Max</Label>
              <Input
                id="salary_max"
                type="number"
                value={formData.salary_max || ''}
                onChange={(e) => setFormData({ ...formData, salary_max: e.target.value ? parseInt(e.target.value) : undefined })}
                placeholder="1200000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="salary_currency">Currency</Label>
              <Select
                value={formData.salary_currency || ''}
                onValueChange={(value: CurrencyCode | '') => setFormData({ ...formData, salary_currency: value || undefined })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={`Default (${preferredCurrency})`} />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.symbol} {currency.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Leave empty for default
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="applied_date">Applied Date</Label>
              <Input
                id="applied_date"
                type="date"
                value={formData.applied_date}
                onChange={(e) => setFormData({ ...formData, applied_date: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="follow_up_date">Follow-up Date</Label>
              <Input
                id="follow_up_date"
                type="date"
                value={formData.follow_up_date || ''}
                onChange={(e) => setFormData({ ...formData, follow_up_date: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="response_date">Response Date</Label>
              <Input
                id="response_date"
                type="date"
                value={formData.response_date || ''}
                onChange={(e) => setFormData({ ...formData, response_date: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Any additional notes about this application..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="gradient-primary shadow-primary">
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {initialData ? 'Update' : 'Add Application'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
