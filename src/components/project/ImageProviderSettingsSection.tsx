import { useState, useEffect } from 'react';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ShieldAlert,
  ShieldCheck,
  Settings2,
  Save,
  FlaskConical,
  Upload,
  Info,
  AlertTriangle,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { ImageProviderSettings, ImageProviderName, Project } from '@/types/types';
import { IMAGE_PROVIDER_OPTIONS } from '@/types/types';

interface Props {
  project: Project;
  onSettingsSaved?: (settings: ImageProviderSettings) => void;
  onProvidersEnabledChange?: (enabled: boolean) => void;
}

const ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:2'];
const OUTPUT_SIZES = ['512x512', '768x512', '1024x576', '1024x1024', '1280x720', '1920x1080'];

function CreditSafeBanner({ enabled }: { enabled: boolean }) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-3 border"
      style={
        enabled
          ? { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }
          : { background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)' }
      }
    >
      {enabled ? (
        <ShieldAlert className="w-4 h-4 shrink-0" style={{ color: '#ef4444' }} />
      ) : (
        <ShieldCheck className="w-4 h-4 shrink-0" style={{ color: '#10b981' }} />
      )}
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-sm" style={{ color: enabled ? '#ef4444' : '#10b981' }}>
          Credit-Safe Mode: {enabled ? 'OFF' : 'ON'}
        </span>
        <p className="text-xs text-muted-foreground mt-0.5">
          {enabled
            ? 'Real AI providers are enabled. Generation will contact external APIs and may consume credits.'
            : 'Real AI providers are disabled. No external API calls will be made. Safe for development.'}
        </p>
      </div>
      <Badge
        className="shrink-0 font-mono text-[10px]"
        style={
          enabled
            ? { background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)' }
            : { background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.4)' }
        }
      >
        {enabled ? 'CREDITS AT RISK' : 'SAFE'}
      </Badge>
    </div>
  );
}

export default function ImageProviderSettingsSection({ project, onSettingsSaved, onProvidersEnabledChange }: Props) {
  const [settings, setSettings] = useState<ImageProviderSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showTestConfirm, setShowTestConfirm] = useState(false);
  const [showEnableConfirm, setShowEnableConfirm] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // Local form state
  const [realEnabled, setRealEnabled] = useState(false);
  const [providerName, setProviderName] = useState<ImageProviderName>('Manual Upload Only');
  const [apiKey, setApiKey] = useState('');
  const [apiEndpoint, setApiEndpoint] = useState('');
  const [modelName, setModelName] = useState('');
  const [outputSize, setOutputSize] = useState('1024x576');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [enabled, setEnabled] = useState(false);
  const [testMode, setTestMode] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [project.id]);

  async function loadSettings() {
    setLoading(true);
    const { data } = await supabase
      .from('image_provider_settings')
      .select('*')
      .eq('project_id', project.id)
      .maybeSingle();

    if (data) {
      const s = data as ImageProviderSettings;
      setSettings(s);
      setRealEnabled(s.real_ai_providers_enabled);
      setProviderName(s.provider_name as ImageProviderName);
      setApiKey(s.api_key || '');
      setApiEndpoint(s.api_endpoint || '');
      setModelName(s.model_name || '');
      setOutputSize(s.output_size || '1024x576');
      setAspectRatio(s.aspect_ratio || '16:9');
      setEnabled(s.enabled);
      setTestMode(s.test_mode);
      // Notify parent of full provider state on load (not just on save).
      // This ensures realProvidersEnabled, providerActive, providerName,
      // and providerEndpoint are correct after a page refresh.
      onProvidersEnabledChange?.(s.real_ai_providers_enabled ?? false);
      onSettingsSaved?.(s);
    }
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    const payload = {
      project_id: project.id,
      real_ai_providers_enabled: realEnabled,
      provider_name: providerName,
      api_key: apiKey || null,
      api_endpoint: apiEndpoint || null,
      model_name: modelName || null,
      output_size: outputSize,
      aspect_ratio: aspectRatio,
      enabled,
      test_mode: testMode,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (settings) {
      result = await supabase
        .from('image_provider_settings')
        .update(payload)
        .eq('id', settings.id)
        .select()
        .maybeSingle();
    } else {
      result = await supabase
        .from('image_provider_settings')
        .insert(payload)
        .select()
        .maybeSingle();
    }

    if (result.error) {
      toast.error(`Failed to save provider settings: ${result.error.message}`);
    } else if (result.data) {
      const saved = result.data as ImageProviderSettings;
      setSettings(saved);
      onSettingsSaved?.(saved);
      onProvidersEnabledChange?.(saved.real_ai_providers_enabled ?? false);
      toast.success('Provider settings saved.');
    }
    setSaving(false);
  }

  function handleToggleRealProviders(val: boolean) {
    if (val) {
      setShowEnableConfirm(true);
    } else {
      setRealEnabled(false);
      if (enabled) setEnabled(false);
    }
  }

  function handleConfirmEnableProviders() {
    setRealEnabled(true);
    setShowEnableConfirm(false);
  }

  const isProviderConfigurable =
    providerName !== 'Disabled' && providerName !== 'Manual Upload Only';

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-6">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading provider settings…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Credit-Safe Mode Banner */}
      <CreditSafeBanner enabled={realEnabled} />

      {/* Warning notice */}
      <div
        className="flex items-start gap-2 rounded-lg px-4 py-3"
        style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}
      >
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-300">
          <span className="font-semibold">Warning:</span> Real AI providers are disabled by default to prevent accidental credit usage.
          Enable them only when you are ready to generate real images using an external provider.
        </p>
      </div>

      {/* Global toggle */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" />
            Real AI Providers Enabled
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Allow external image generation calls</p>
              <p className="text-xs text-muted-foreground">Default: Disabled. Turn on only when ready to use credits.</p>
            </div>
            <Switch checked={realEnabled} onCheckedChange={handleToggleRealProviders} />
          </div>
          {!realEnabled && (
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
            >
              <Info className="w-3 h-3 text-emerald-400 shrink-0" />
              <p className="text-xs text-emerald-400">
                No image provider is connected. You can upload scene images manually or create placeholder previews for planning.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Provider config */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            Image Provider Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Provider selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-sm font-normal">Provider Name</Label>
              <Select value={providerName} onValueChange={(v) => setProviderName(v as ImageProviderName)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_PROVIDER_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-sm font-normal">Aspect Ratio</Label>
              <Select value={aspectRatio} onValueChange={setAspectRatio}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASPECT_RATIOS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Configurable fields — shown only for non-disabled providers */}
          {isProviderConfigurable && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-sm font-normal">API Key</Label>
                <div className="flex gap-2">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter your API key"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-sm font-normal">API Endpoint</Label>
                  <Input
                    value={apiEndpoint}
                    onChange={(e) => setApiEndpoint(e.target.value)}
                    placeholder="https://api.provider.com/v1/images"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-normal">Model Name</Label>
                  <Input
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="e.g. dall-e-3, stable-diffusion-xl"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-sm font-normal">Output Size</Label>
                <Select value={outputSize} onValueChange={setOutputSize}>
                  <SelectTrigger className="w-full md:w-[220px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OUTPUT_SIZES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Provider toggles */}
          <div className="flex flex-col sm:flex-row gap-4 pt-1">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Provider Enabled</p>
                <p className="text-xs text-muted-foreground">Allow generation calls to this provider</p>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={(v) => {
                  if (v && !realEnabled) {
                    toast.warning('Enable Real AI Providers first to activate this provider.');
                    return;
                  }
                  setEnabled(v);
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Test Mode</p>
                <p className="text-xs text-muted-foreground">Dry run — logs request without generating</p>
              </div>
              <Switch checked={testMode} onCheckedChange={setTestMode} />
            </div>
          </div>

          {/* Manual upload fallback notice */}
          {(providerName === 'Disabled' || providerName === 'Manual Upload Only' || !enabled) && (
            <div
              className="flex items-start gap-2 rounded-lg px-3 py-2.5"
              style={{ background: 'rgba(59,126,255,0.07)', border: '1px solid rgba(59,126,255,0.2)' }}
            >
              <Upload className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-300">
                No image generation provider is connected. You can{' '}
                <span className="font-semibold">upload scene images manually</span> or{' '}
                <span className="font-semibold">create placeholder previews</span> for planning.
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="gap-2"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Provider Settings
            </Button>
            <Button
              variant="secondary"
              className="gap-2"
              onClick={() => setShowTestConfirm(true)}
              disabled={!isProviderConfigurable || !apiKey}
            >
              <FlaskConical className="w-3.5 h-3.5" />
              Test Connection — Manual Only
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Current status summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: 'Real Providers', value: realEnabled ? 'Enabled' : 'Disabled', warn: realEnabled },
          { label: 'Provider', value: providerName, warn: false },
          { label: 'Provider Active', value: enabled ? 'Yes' : 'No', warn: enabled && !realEnabled },
          { label: 'Test Mode', value: testMode ? 'On' : 'Off', warn: false },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-lg px-3 py-2 border"
            style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
          >
            <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">{item.label}</p>
            <p
              className="text-sm font-semibold mt-0.5"
              style={{ color: item.warn ? '#ef4444' : undefined }}
            >
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {/* Enable confirmation dialog */}
      <AlertDialog open={showEnableConfirm} onOpenChange={setShowEnableConfirm}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              Enable Real AI Providers?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Enabling real AI providers will allow BeatVision to contact external image generation
              APIs when you click Generate Image. This <strong>may consume credits</strong> on your
              external provider account. Only proceed if you are ready to use real image generation.
              You can disable this at any time to return to Credit-Safe Mode.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel — Keep Safe</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-500 hover:bg-amber-600 text-white"
              onClick={handleConfirmEnableProviders}
            >
              Enable Real Providers
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Test connection confirmation dialog */}
      <AlertDialog open={showTestConfirm} onOpenChange={setShowTestConfirm}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FlaskConical className="w-5 h-5" />
              Test Connection?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This may contact the provider to validate your API key and endpoint.
              It will <strong>not</strong> generate an image, but it may log a request on the
              provider's side. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowTestConfirm(false);
                toast.info('Connection test skipped — no live provider call in Credit-Safe development mode.');
              }}
            >
              Continue Test
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
