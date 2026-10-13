import type { User as FirebaseUser } from 'firebase/auth';
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useProfile } from '@/hooks/useProfile';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ClipboardList, Menu, X, User, LayoutDashboard, LogOut, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Navbar() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-[100] px-4 pt-4">
      {/* Glassmorphic pill container */}
      <div
        className={cn(
          'mx-auto max-w-4xl rounded-full transition-all duration-300',
          'bg-white/10 backdrop-blur-xl border border-white/20',
          'shadow-lg shadow-black/10',
          scrolled && 'bg-black/80 backdrop-blur-2xl border-white/30'
        )}
      >
        <div className="px-6 py-3 flex items-center justify-between">
          {/* Logo */}
          <Link 
            to="/" 
            className="flex items-center gap-2 group"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <div className="p-2 rounded-lg bg-white/20 transition-transform duration-300 group-hover:scale-110">
              <ClipboardList className="h-5 w-5 text-white" />
            </div>
            <span className="font-display font-bold text-lg text-white">Application Tracker</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            <AuthButtons user={user} />
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6 text-white" />
            ) : (
              <Menu className="h-6 w-6 text-white" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <div
        className={cn(
          'md:hidden mx-auto max-w-4xl mt-2 rounded-2xl overflow-hidden transition-all duration-300',
          'bg-white/10 backdrop-blur-xl border border-white/20',
          mobileMenuOpen ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0 border-transparent'
        )}
      >
        <div className="px-6 py-4 flex flex-col gap-4">
          <AuthButtons user={user} mobile onClose={() => setMobileMenuOpen(false)} />
        </div>
      </div>
    </nav>
  );
}


function UserProfileButton({ mobile, onClose }: { mobile?: boolean; onClose?: () => void }) {
  const { signOut, user } = useAuth();
  const { profile } = useProfile();
  const navigate = useNavigate();

  const getInitials = () => {
    if (profile?.full_name) {
      return profile.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return 'U';
  };

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'User';

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
    onClose?.();
  };

  if (mobile) {
    return (
      <div className="flex flex-col gap-2 pt-2 border-t border-white/20">
        <div className="flex items-center gap-3 py-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-white/20 text-white text-sm">
              {getInitials()}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium text-white">{displayName}</span>
        </div>
        <Link
          to="/profile"
          onClick={onClose}
          className="flex items-center gap-2 py-2 pl-2 text-white/70 hover:text-white transition-colors"
        >
          <User className="h-4 w-4" />
          View Profile
        </Link>
        <Link
          to="/dashboard"
          onClick={onClose}
          className="flex items-center gap-2 py-2 pl-2 text-white/70 hover:text-white transition-colors"
        >
          <LayoutDashboard className="h-4 w-4" />
          Dashboard
        </Link>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 py-2 pl-2 text-white/70 hover:text-white transition-colors text-left"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-2 px-2 hover:bg-white/10">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-white/20 text-white text-sm">
              {getInitials()}
            </AvatarFallback>
          </Avatar>
          <span className="hidden lg:inline font-medium max-w-[120px] truncate text-white">
            {displayName}
          </span>
          <ChevronDown className="h-4 w-4 text-white/70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[110] w-48 bg-black/90 backdrop-blur-2xl border-white/20">
        <DropdownMenuItem asChild>
          <Link to="/profile" className="flex items-center gap-2 cursor-pointer text-white hover:bg-white/10">
            <User className="h-4 w-4" />
            View Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/dashboard" className="flex items-center gap-2 cursor-pointer text-white hover:bg-white/10">
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-white/20" />
        <DropdownMenuItem onClick={handleSignOut} className="flex items-center gap-2 cursor-pointer text-white hover:bg-white/10">
          <LogOut className="h-4 w-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AuthButtons({ user, mobile, onClose }: { user: FirebaseUser | null; mobile?: boolean; onClose?: () => void }) {
  if (user) {
    return (
      <div className={cn('flex items-center gap-3', mobile && 'flex-col items-stretch')}>
        {!mobile && (
          <Button asChild variant="ghost" size="sm" className="px-4 py-2 text-white hover:bg-white/10">
            <Link to="/dashboard">Dashboard</Link>
          </Button>
        )}
        <UserProfileButton mobile={mobile} onClose={onClose} />
      </div>
    );
  }

  return (
    <div className={cn('flex gap-3', mobile && 'flex-col')}>
      <Button 
        asChild 
        size={mobile ? 'default' : 'sm'} 
        className={cn(
          'bg-white text-black hover:bg-white/90 rounded-full font-medium',
          mobile ? 'px-6 py-3' : 'px-4 py-2'
        )}
      >
        <Link to="/login">Sign In</Link>
      </Button>
    </div>
  );
}
