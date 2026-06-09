import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/layouts/Navbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ShieldCheck,
  ShieldAlert,
  LayoutDashboard,
  AlertTriangle,
  CheckCircle2,
  Info,
  Cpu,
  Video,
  Image as ImageIcon,
  Music2,
} from 'lucide-react';
import { CREDIT_SAFE_MODE, REAL_AI_PROVIDERS_ENABLED, SUPABASE_CONFIGURED } from '@/config/safeMode';

// ── Status row helper ─────────────────────────────────────────────────────────
function StatusRow({
  icon,
  label,
  status,
  description,
}: {
  icon: React.ReactNode;
  label: string;
  status: 'safe' | 'active' | 'warning' | 'info';
  description: string;
}) {
  const colors = {
    safe: { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)', text: '#10b981' },
    active: { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)', text: '#3b82f6' },
    warning: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)', text: '#ef4444' },
    info: { bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.25)', text: '#94a3b8' },
  };
  const c = colors[status];
  return (
    <div
      className="flex items-start gap-3 rounded-xl px-4 py-3 border"
      style={{ background: c.bg, borderColor: c.border }}
    >
      <div className="mt-0.5 shrink-0" style={{ color: c.text }}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-foreground">{label}</span>
          <Badge
            className="text-[10px] font-mono px-1.5"
            style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
          >
            {status === 'safe' ? 'DISABLED' : status === 'active' ? 'ACTIVE' : status === 'warning' ? 'AT RISK' : 'INFO'}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ProviderSettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const isCreditSafe = CREDIT_SAFE_MODE || !REAL_AI_PROVIDERS_ENABLED;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-14 max-w-3xl mx-auto px-4 md:px-6 py-10 space-y-8">

        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }}
            >
              {isCreditSafe
                ? <ShieldCheck className="w-5 h-5 text-emerald-400" />
                : <ShieldAlert className="w-5 h-5 text-red-400" />}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-balance text-foreground">Provider Settings</h1>
              <p className="text-sm text-muted-foreground text-pretty">
                Global AI provider status for BeatVision
              </p>
            </div>
          </div>
        </div>

        {/* Credit-Safe Mode Banner */}
        <div
          className="rounded-2xl p-5 border"
          style={
            isCreditSafe
              ? { background: 'rgba(16,185,129,0.07)', borderColor: 'rgba(16,185,129,0.3)' }
              : { background: 'rgba(239,68,68,0.07)', borderColor: 'rgba(239,68,68,0.3)' }
          }
        >
          <div className="flex items-center gap-3 mb-2">
            {isCreditSafe
              ? <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              : <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />}
            <span
              className="font-bold text-base"
              style={{ color: isCreditSafe ? '#10b981' : '#ef4444' }}
            >
              Credit-Safe Mode: {isCreditSafe ? 'ON' : 'OFF'}
            </span>
            <Badge
              className="ml-auto text-[10px] font-mono"
              style={
                isCreditSafe
                  ? { background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.4)' }
                  : { background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)' }
              }
            >
              {isCreditSafe ? 'SAFE' : 'CREDITS AT RISK'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground text-pretty">
            {isCreditSafe
              ? 'No real AI providers are active. BeatVision will not make any external API calls or consume credits. You can safely explore all features — upload images manually or use placeholder previews.'
              : 'Real AI providers are enabled. Generation will contact external APIs and may consume credits. Make sure your API keys and billing are configured correctly.'}
          </p>
        </div>

        {/* Provider Status Grid */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
              Provider Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatusRow
              icon={<Cpu className="w-4 h-4" />}
              label="LLM (World / Storyboard / Prompts)"
              status={REAL_AI_PROVIDERS_ENABLED ? 'active' : 'safe'}
              description={
                REAL_AI_PROVIDERS_ENABLED
                  ? 'Calls the Gemini 2.5 Flash gateway via Supabase Edge Function.'
                  : 'Disabled. World generation, storyboard, and scene prompts will not call the LLM until real providers are enabled.'
              }
            />
            <StatusRow
              icon={<ImageIcon className="w-4 h-4" />}
              label="Image Generation"
              status="safe"
              description="Disabled by default. Set to Manual Upload Only. Enable a real provider per-project in the Image Provider Settings section on the project page."
            />
            <StatusRow
              icon={<Video className="w-4 h-4" />}
              label="Video Generation (Kling)"
              status="safe"
              description="Disabled by default. Motion clips use fallback Simulated Preview mode. Real video generation requires Kling credentials configured as Supabase Edge Function secrets."
            />
            <StatusRow
              icon={<Music2 className="w-4 h-4" />}
              label="Browser WebM Renderer"
              status="info"
              description="Available in all modes — uses MediaRecorder browser API only, no external API calls, no credits consumed."
            />
          </CardContent>
        </Card>

        {/* Environment / Config Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
              Environment Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl px-4 py-3 border"
              style={
                SUPABASE_CONFIGURED
                  ? { background: 'rgba(16,185,129,0.06)', borderColor: 'rgba(16,185,129,0.25)' }
                  : { background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.25)' }
              }
            >
              {SUPABASE_CONFIGURED
                ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                : <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  Supabase: {SUPABASE_CONFIGURED ? 'Configured' : 'Not Configured'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {SUPABASE_CONFIGURED
                    ? 'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.'
                    : 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your Vercel environment variables or .env file.'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl px-4 py-3 border"
              style={{ background: 'rgba(100,116,139,0.06)', borderColor: 'rgba(100,116,139,0.2)' }}
            >
              <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Where to configure per-project providers</p>
                <p className="text-xs text-muted-foreground text-pretty">
                  Image provider settings (API key, endpoint, model, credit-safe toggle) are configured
                  per project inside the <strong>Image Provider Settings</strong> section on each project page.
                  This ensures provider keys are scoped to the project and never exposed globally.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  LLM and video provider secrets are set as Supabase Edge Function secrets via the Supabase dashboard or CLI:
                </p>
                <code className="block text-[11px] bg-muted/60 rounded px-2 py-1 mt-1 font-mono text-muted-foreground">
                  supabase secrets set INTEGRATIONS_API_KEY=your-key
                </code>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        {user && (
          <div className="flex gap-3">
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => navigate('/dashboard')}
            >
              <LayoutDashboard className="w-4 h-4 mr-1.5" />
              Dashboard
            </Button>
          </div>
        )}

        {!user && (
          <p className="text-xs text-muted-foreground">
            Sign in to access project-level provider settings.
          </p>
        )}
      </div>
    </div>
  );
}
