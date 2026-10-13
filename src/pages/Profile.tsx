import { useState, useEffect } from 'react';
import { Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useProfile, ProfileFormData } from '@/hooks/useProfile';
import { PageLayout } from '@/components/PageLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Loader2, 
  ClipboardList, 
  ArrowLeft, 
  User, 
  Mail, 
  AlertCircle,
  Coins
} from 'lucide-react';
import { CURRENCY_OPTIONS, CurrencyCode } from '@/types/currency';

export default function Profile() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading, updateProfile } = useProfile();
  const location = useLocation();
  const navigate = useNavigate();
  const requireCompletion = location.state?.requireCompletion === true;
  
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<ProfileFormData>({
    full_name: '',
    preferred_currency: 'INR',
  });

  const isProfileComplete = Boolean(formData.full_name && formData.full_name.trim() !== '');

  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || '',
        preferred_currency: profile.preferred_currency || 'INR',
      });
    }
  }, [profile]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.full_name || formData.full_name.trim() === '') {
      return;
    }
    
    setSaving(true);
    const result = await updateProfile(formData);
    setSaving(false);
    
    // Always redirect to dashboard on successful save
    if (!result.error) {
      navigate('/dashboard');
    }
  };

  return (
    <PageLayout>
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-2xl border-b border-white/20">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="p-2 rounded-lg bg-white/20 transition-transform duration-300 group-hover:scale-110">
              <ClipboardList className="h-5 w-5 text-white" />
            </div>
            <span className="font-display font-bold text-lg text-white">Application Tracker</span>
          </Link>
          
          {isProfileComplete && (
            <Link to="/dashboard">
              <Button variant="ghost" size="sm" className="gap-2 text-white hover:bg-white/10">
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Button>
            </Link>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <Card className="bg-black/80 backdrop-blur-2xl border-white/20 shadow-strong animate-scale-in">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 rounded-xl bg-white/10">
                <User className="h-6 w-6 text-white" />
              </div>
              <div>
                <CardTitle className="font-display text-2xl text-white">Your Profile</CardTitle>
                <CardDescription className="text-white/70">
                  Manage your personal information
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {requireCompletion && (
              <Alert className="mb-6 border-yellow-500/50 bg-yellow-500/10">
                <AlertCircle className="h-4 w-4 text-yellow-500" />
                <AlertDescription className="text-yellow-500">
                  Please complete your profile to continue. Full Name is required.
                </AlertDescription>
              </Alert>
            )}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Email (read-only) */}
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2 text-white">
                  <Mail className="h-4 w-4 text-white/70" />
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={profile?.email || user.email || ''}
                  disabled
                  className="bg-white/5 border-white/20 text-white/70"
                />
                <p className="text-xs text-white/50">
                  Email cannot be changed
                </p>
              </div>

              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="full_name" className="flex items-center gap-2 text-white">
                  <User className="h-4 w-4 text-white/70" />
                  Full Name <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="full_name"
                  value={formData.full_name || ''}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="John Doe"
                  required
                  className={`bg-white/10 border-white/20 text-white placeholder:text-white/50 ${!formData.full_name?.trim() && requireCompletion ? 'border-red-400' : ''}`}
                />
                {!formData.full_name?.trim() && requireCompletion && (
                  <p className="text-xs text-red-400">Full name is required</p>
                )}
              </div>

              {/* Preferred Currency */}
              <div className="space-y-2">
                <Label htmlFor="preferred_currency" className="flex items-center gap-2 text-white">
                  <Coins className="h-4 w-4 text-white/70" />
                  Preferred Currency
                </Label>
                <Select
                  value={formData.preferred_currency}
                  onValueChange={(value: CurrencyCode) => setFormData({ ...formData, preferred_currency: value })}
                >
                  <SelectTrigger className="bg-white/10 border-white/20 text-white">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent className="bg-black/95 border-white/20">
                    {CURRENCY_OPTIONS.map((currency) => (
                      <SelectItem key={currency.code} value={currency.code} className="text-white hover:bg-white/10">
                        {currency.symbol} {currency.name} ({currency.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-white/50">
                  Default currency for salary display
                </p>
              </div>

              {/* Submit Button */}
              <div className="pt-4">
                <Button 
                  type="submit" 
                  disabled={saving || !formData.full_name?.trim()} 
                  className="w-full gradient-primary shadow-primary"
                >
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </PageLayout>
  );
}
