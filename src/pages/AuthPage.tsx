import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Music2, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

const supabaseConfigured =
  !!import.meta.env.VITE_SUPABASE_URL &&
  !!import.meta.env.VITE_SUPABASE_ANON_KEY;

export default function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');

  // Form fields
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);

  // Per-field errors
  const [emailError, setEmailError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  // Reset errors and form when switching modes
  const switchMode = (next: 'signin' | 'signup') => {
    setMode(next);
    setEmail('');
    setUsername('');
    setPassword('');
    setAgreed(false);
    setEmailError('');
    setUsernameError('');
    setPasswordError('');
  };

  // Validate all fields, set per-field errors, return true if valid
  const validate = (): boolean => {
    let valid = true;

    // Email
    if (!email.trim()) {
      setEmailError('Please enter a valid email address.');
      valid = false;
    } else if (!EMAIL_REGEX.test(email.trim())) {
      setEmailError('Please enter a valid email address.');
      valid = false;
    } else {
      setEmailError('');
    }

    // Username (signup only — optional but must be valid if provided)
    if (mode === 'signup') {
      if (username.trim() && !USERNAME_REGEX.test(username.trim())) {
        setUsernameError('Username can only contain letters, numbers, and underscores.');
        valid = false;
      } else {
        setUsernameError('');
      }
    }

    // Password
    if (!password) {
      setPasswordError('Password must be at least 6 characters.');
      valid = false;
    } else if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      valid = false;
    } else {
      setPasswordError('');
    }

    return valid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!supabaseConfigured) {
      toast.error('Supabase is not connected. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return;
    }

    if (!validate()) return;

    if (mode === 'signup' && !agreed) {
      toast.error('Please agree to the User Agreement and Privacy Policy.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signin') {
        const { error } = await signIn(email.trim(), password);
        if (error) {
          const msg = error.message ?? '';
          if (
            msg.toLowerCase().includes('invalid login') ||
            msg.toLowerCase().includes('invalid credentials') ||
            msg.toLowerCase().includes('email not confirmed')
          ) {
            toast.error('Email or password is incorrect.');
          } else if (msg.toLowerCase().includes('supabase is not connected')) {
            toast.error(msg);
          } else {
            toast.error(msg || 'Sign in failed. Please try again.');
          }
          return;
        }
        toast.success('Welcome back to BeatVision!');
        navigate('/dashboard');
      } else {
        const { error, emailConfirmRequired } = await signUp(
          email.trim(),
          password,
          username.trim()
        );
        if (error) {
          const msg = error.message ?? '';
          if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already exists')) {
            setEmailError('An account with this email already exists.');
          } else if (msg.toLowerCase().includes('supabase is not connected')) {
            toast.error(msg);
          } else {
            toast.error(msg || 'Account creation failed. Please try again.');
          }
          return;
        }
        if (emailConfirmRequired) {
          toast.success('Account created successfully. Check your email to confirm your account.');
        } else {
          toast.success('Account created successfully. Welcome to BeatVision!');
          navigate('/dashboard');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute top-2/3 left-1/3 w-64 h-64 bg-purple-500/8 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <Music2 className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl tracking-wide gradient-text">BeatVision</span>
          </Link>
          <p className="text-muted-foreground text-sm">Every Song Has a World. BeatVision Reveals It.</p>
        </div>

        {/* Supabase not configured warning */}
        {!supabaseConfigured && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-600 dark:text-yellow-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Supabase is not connected.{' '}
              Set <code className="font-mono">VITE_SUPABASE_URL</code> and{' '}
              <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> in your{' '}
              <code className="font-mono">.env</code> file or Vercel environment variables.
            </span>
          </div>
        )}

        <Card className="bg-card border-border card-glow">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl text-center text-balance text-foreground">
              {mode === 'signin' ? 'Welcome back' : 'Create your account'}
            </CardTitle>
            <CardDescription className="text-center text-muted-foreground">
              {mode === 'signin'
                ? 'Sign in to access your projects'
                : 'Start revealing worlds in your music'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>

              {/* Email field — both modes */}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-normal text-muted-foreground">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailError(''); }}
                  placeholder="you@example.com"
                  className={`bg-secondary border-border text-foreground placeholder:text-muted-foreground/50 h-10 ${emailError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                  autoComplete="email"
                  aria-describedby={emailError ? 'email-error' : undefined}
                />
                {emailError && (
                  <p id="email-error" className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {emailError}
                  </p>
                )}
              </div>

              {/* Username / Display Name — signup only */}
              {mode === 'signup' && (
                <div className="space-y-1.5">
                  <Label htmlFor="username" className="text-sm font-normal text-muted-foreground">
                    Username / Display Name <span className="text-muted-foreground/60">(optional)</span>
                  </Label>
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setUsernameError(''); }}
                    placeholder="your_username"
                    className={`bg-secondary border-border text-foreground placeholder:text-muted-foreground/50 h-10 ${usernameError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    autoComplete="username"
                    aria-describedby={usernameError ? 'username-error' : undefined}
                  />
                  {usernameError && (
                    <p id="username-error" className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      {usernameError}
                    </p>
                  )}
                </div>
              )}

              {/* Password field — both modes */}
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-normal text-muted-foreground">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setPasswordError(''); }}
                    placeholder="••••••••"
                    className={`bg-secondary border-border text-foreground placeholder:text-muted-foreground/50 h-10 pr-10 ${passwordError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    aria-describedby={passwordError ? 'password-error' : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {passwordError && (
                  <p id="password-error" className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {passwordError}
                  </p>
                )}
              </div>

              {/* User agreement — signup only */}
              {mode === 'signup' && (
                <div className="flex items-start gap-3 pt-1">
                  <Checkbox
                    id="agree"
                    checked={agreed}
                    onCheckedChange={(v) => setAgreed(!!v)}
                    className="mt-0.5"
                  />
                  <label htmlFor="agree" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                    I agree to the{' '}
                    <span className="text-primary underline-offset-2 hover:underline cursor-pointer">User Agreement</span>
                    {' '}and{' '}
                    <span className="text-primary underline-offset-2 hover:underline cursor-pointer">Privacy Policy</span>
                    . BeatVision may remember my creative preferences to improve suggestions.
                  </label>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90 font-medium mt-2"
              >
                {loading ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
              </Button>
            </form>

            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {mode === 'signin' ? (
                  <>Don't have an account? <span className="text-primary">Sign up</span></>
                ) : (
                  <>Already have an account? <span className="text-primary">Sign in</span></>
                )}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
