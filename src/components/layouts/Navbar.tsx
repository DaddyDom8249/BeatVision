import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Music2, LogOut, LayoutDashboard, Plus, LogIn, Settings2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Navbar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out successfully');
    navigate('/');
  };

  const isLanding = location.pathname === '/';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <Music2 className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-sm tracking-wide text-foreground group-hover:text-primary transition-colors">
            BeatVision
          </span>
        </Link>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => navigate('/dashboard')}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span className="hidden md:inline ml-1.5">Dashboard</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => navigate('/settings/providers')}
                title="Provider Settings"
              >
                <Settings2 className="w-4 h-4" />
                <span className="hidden md:inline ml-1.5">Providers</span>
              </Button>
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => navigate('/create')}
              >
                <Plus className="w-4 h-4" />
                <span className="hidden md:inline ml-1.5">New Project</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={handleSignOut}
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              {!isLanding && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => navigate('/')}
                >
                  Home
                </Button>
              )}
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => navigate('/auth')}
              >
                <LogIn className="w-4 h-4" />
                <span className="ml-1.5">Sign In</span>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
