import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
  ImageIcon,
  RefreshCw,
  Edit3,
  CheckCircle2,
  XCircle,
  GitCompare,
  Loader2,
  ChevronDown,
  ChevronUp,
  Film,
  MapPin,
  Aperture,
  Sunset,
  User,
  Sparkles,
  Upload,
  FileImage,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { SceneImage, SceneImageVersion, SceneVisualPrompt } from '@/types/types';

interface Props {
  image: SceneImage;
  versions: SceneImageVersion[];
  prompt: SceneVisualPrompt | null;
  isGenerating: boolean;
  realProvidersEnabled: boolean;
  providerActive: boolean;
  onGenerate: (sceneImageId: string, promptId: string) => void;
  onRegenerate: (sceneImageId: string, promptId: string) => void;
  onUpload: (sceneImageId: string, file: File) => void;
  onCreatePlaceholder: (sceneImageId: string) => void;
  onUsePlaceholderAsDraft: (sceneImageId: string) => void;
  onApprove: (sceneImageId: string) => void;
  onReject: (sceneImageId: string) => void;
  onCompare: (sceneImage: SceneImage) => void;
  onEditPrompt: (prompt: SceneVisualPrompt, updatedFields: Partial<SceneVisualPrompt>) => void;
}

function ImageSourceBadge({ image }: { image: SceneImage }) {
  if (image.real_generated)
    return <Badge className="bg-[#8b5cf6]/20 text-[#a78bfa] border-[#8b5cf6]/30 font-mono text-[10px]">AI GENERATED</Badge>;
  if (image.manual_upload)
    return <Badge className="bg-[#3b7eff]/20 text-[#3b7eff] border-[#3b7eff]/30 font-mono text-[10px]">MANUAL UPLOAD</Badge>;
  if (image.placeholder && image.use_placeholder_as_draft_final)
    return <Badge className="bg-[#f59e0b]/20 text-[#f59e0b] border-[#f59e0b]/30 font-mono text-[10px]">PLACEHOLDER DRAFT</Badge>;
  if (image.placeholder)
    return <Badge className="bg-[#444]/40 text-[#888] border-[#444]/60 font-mono text-[10px]">PLACEHOLDER PREVIEW</Badge>;
  return null;
}

function StatusBadge({ image }: { image: SceneImage }) {
  if (image.approved) return <Badge className="bg-[#10b981]/20 text-[#10b981] border-[#10b981]/30 font-mono text-[10px]">APPROVED</Badge>;
  if (image.rejected) return <Badge className="bg-[#ef4444]/20 text-[#ef4444] border-[#ef4444]/30 font-mono text-[10px]">REJECTED</Badge>;
  if (image.generation_status === 'generating') return <Badge className="bg-[#3b7eff]/20 text-[#3b7eff] border-[#3b7eff]/30 font-mono text-[10px]">GENERATING</Badge>;
  if (image.generation_status === 'generated' || image.generation_status === 'manual_upload')
    return <Badge className="bg-[#f59e0b]/20 text-[#f59e0b] border-[#f59e0b]/30 font-mono text-[10px]">IN REVIEW</Badge>;
  if (image.generation_status === 'placeholder_preview')
    return <Badge className="bg-[#555]/30 text-[#999] border-[#555]/50 font-mono text-[10px]">PLACEHOLDER</Badge>;
  if (image.generation_status === 'failed') return <Badge className="bg-[#ef4444]/20 text-[#ef4444] border-[#ef4444]/30 font-mono text-[10px]">FAILED</Badge>;
  if (image.generation_status === 'provider_disabled')
    return <Badge className="bg-[#555]/30 text-[#888] border-[#555]/50 font-mono text-[10px]">PROVIDER OFF</Badge>;
  return <Badge className="bg-[#222] text-[#555] border-[#333] font-mono text-[10px]">PENDING</Badge>;
}

function PlaceholderCanvas({ image }: { image: SceneImage }) {
  const start = image.placeholder_gradient_start || '#1a1a2e';
  const end = image.placeholder_gradient_end || '#0d0d0d';
  const accent = image.placeholder_accent || '#3b7eff';
  const label1 = image.placeholder_label_1 || image.scene_title || `Scene ${image.scene_number}`;
  const label2 = image.placeholder_label_2 || image.mood || '';
  const desc = image.placeholder_description || '';

  return (
    <div
      className="w-full aspect-video rounded relative overflow-hidden flex flex-col items-center justify-center p-4 text-center"
      style={{ background: `linear-gradient(135deg, ${start}, ${end})` }}
    >
      {/* Diagonal wireframe lines */}
      <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id={`diag-${image.id}`} width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="24" stroke="white" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#diag-${image.id})`} />
      </svg>

      {/* Scene number */}
      <div
        className="absolute top-3 left-3 font-mono text-[10px] font-bold px-2 py-0.5 rounded"
        style={{ background: accent + '33', color: accent, border: `1px solid ${accent}55` }}
      >
        SCENE {String(image.scene_number).padStart(2, '0')}
      </div>

      {/* Timestamp */}
      {image.timestamp_range && (
        <div className="absolute top-3 right-3 font-mono text-[10px] text-white/40">
          {image.timestamp_range}
        </div>
      )}

      {/* Main icon */}
      <Film className="w-10 h-10 mb-3 opacity-40" style={{ color: accent }} />

      {/* Labels */}
      <p className="font-mono text-xs font-bold text-white/80 text-balance leading-tight mb-1">{label1}</p>
      {label2 && <p className="font-mono text-[10px] text-white/40 uppercase tracking-widest">{label2}</p>}

      {/* Description preview */}
      {desc && (
        <p className="mt-3 text-[10px] text-white/30 max-w-xs leading-relaxed text-pretty">
          {desc.slice(0, 120)}{desc.length > 120 ? '…' : ''}
        </p>
      )}

      {/* Bottom: "Placeholder Preview" label — clearly not a real image */}
      <div className="absolute bottom-3 left-0 right-0 text-center">
        <span
          className="font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 rounded"
          style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          Placeholder Preview — not a generated scene image
        </span>
      </div>
    </div>
  );
}

export default function SceneImageCard({
  image,
  versions,
  prompt,
  isGenerating,
  realProvidersEnabled,
  providerActive,
  onGenerate,
  onRegenerate,
  onUpload,
  onCreatePlaceholder,
  onUsePlaceholderAsDraft,
  onApprove,
  onReject,
  onCompare,
  onEditPrompt,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [editedMainPrompt, setEditedMainPrompt] = useState(prompt?.main_image_prompt || '');
  const [editedNegativePrompt, setEditedNegativePrompt] = useState(prompt?.negative_prompt || '');
  const [showPlaceholderDraftConfirm, setShowPlaceholderDraftConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasImage = !!image.image_url;
  const hasPrompt = !!prompt;
  const versionCount = versions.length;

  // An image counts as ready for motion only if it is real or manual or accepted placeholder
  const countsForMotion =
    (image.real_generated || image.manual_upload || image.use_placeholder_as_draft_final) &&
    image.approved;

  const handleSavePrompt = () => {
    if (!prompt) return;
    onEditPrompt(prompt, {
      main_image_prompt: editedMainPrompt,
      negative_prompt: editedNegativePrompt,
    });
    setEditingPrompt(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(image.id, file);
    e.target.value = '';
  };

  const handleGenerateClick = () => {
    if (!hasPrompt) return;
    if (!realProvidersEnabled) return;
    if (!providerActive) return;
    if (image.generation_status === 'pending' || image.generation_status === 'provider_disabled') {
      onGenerate(image.id, prompt!.id);
    } else {
      onRegenerate(image.id, prompt!.id);
    }
  };

  return (
    <div
      className={`bg-[#111] border rounded overflow-hidden transition-all duration-200 ${
        image.approved
          ? 'border-[#10b981]/40'
          : image.rejected
          ? 'border-[#ef4444]/30'
          : image.placeholder && !image.use_placeholder_as_draft_final
          ? 'border-[#444]/50'
          : 'border-[#222]'
      }`}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1a1a1a]">
        <span className="font-mono text-xs text-[#3b7eff] font-bold shrink-0">
          {String(image.scene_number).padStart(2, '0')}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-sm font-semibold text-foreground truncate">
            {image.scene_title || `Scene ${image.scene_number}`}
          </p>
          {image.timestamp_range && (
            <p className="font-mono text-[10px] text-[#555]">{image.timestamp_range}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <ImageSourceBadge image={image} />
          <StatusBadge image={image} />
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-[#555] hover:text-foreground transition-colors shrink-0"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Image area */}
      <div className="px-4 pt-4">
        {hasImage ? (
          <div className="relative w-full aspect-video rounded overflow-hidden bg-[#0a0a0a]">
            <img
              src={image.image_url!}
              alt={image.scene_title || `Scene ${image.scene_number}`}
              className="w-full h-full object-cover"
            />
            {/* Source label overlay */}
            {(image.manual_upload || image.real_generated) && (
              <div className="absolute top-2 left-2">
                <span
                  className="font-mono text-[9px] px-1.5 py-0.5 rounded uppercase tracking-widest"
                  style={
                    image.real_generated
                      ? { background: 'rgba(139,92,246,0.8)', color: '#fff' }
                      : { background: 'rgba(59,126,255,0.8)', color: '#fff' }
                  }
                >
                  {image.real_generated ? 'AI Generated' : 'Manually Uploaded'}
                </span>
              </div>
            )}
          </div>
        ) : (
          <PlaceholderCanvas image={image} />
        )}
      </div>

      {/* Placeholder draft warning */}
      {image.placeholder && image.use_placeholder_as_draft_final && (
        <div
          className="mx-4 mt-3 flex items-start gap-2 rounded-lg px-3 py-2"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}
        >
          <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-amber-300 leading-relaxed">
            This is a placeholder preview, not a real generated image. Accepted for draft video rendering.
            Replace with a generated or uploaded image before final production.
          </p>
        </div>
      )}

      {/* Motion readiness indicator */}
      {image.approved && (
        <div className="mx-4 mt-3">
          {countsForMotion ? (
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)' }}
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
              <p className="text-[10px] text-emerald-400">Ready for Motion</p>
            </div>
          ) : (
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)' }}
            >
              <Info className="w-3 h-3 text-amber-400 shrink-0" />
              <p className="text-[10px] text-amber-300">
                Approved but only a placeholder — does not count for motion until accepted as draft or replaced.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Prompt summary */}
      {image.prompt_summary && (
        <div className="px-4 pt-3">
          <p className="text-[11px] text-[#666] leading-relaxed text-pretty italic">
            {image.prompt_summary}
          </p>
        </div>
      )}

      {/* Metadata pills */}
      <div className="px-4 pt-3 flex flex-wrap gap-2">
        {image.mood && (
          <div className="flex items-center gap-1 bg-[#1a1a1a] border border-[#222] rounded px-2 py-1">
            <Sparkles className="w-3 h-3 text-[#8b5cf6]" />
            <span className="font-mono text-[10px] text-[#888]">{image.mood}</span>
          </div>
        )}
        {image.camera_framing && (
          <div className="flex items-center gap-1 bg-[#1a1a1a] border border-[#222] rounded px-2 py-1">
            <Aperture className="w-3 h-3 text-[#3b7eff]" />
            <span className="font-mono text-[10px] text-[#888]">{image.camera_framing}</span>
          </div>
        )}
        {image.location && (
          <div className="flex items-center gap-1 bg-[#1a1a1a] border border-[#222] rounded px-2 py-1">
            <MapPin className="w-3 h-3 text-[#f59e0b]" />
            <span className="font-mono text-[10px] text-[#888]">{image.location}</span>
          </div>
        )}
        {image.lighting_direction && (
          <div className="flex items-center gap-1 bg-[#1a1a1a] border border-[#222] rounded px-2 py-1">
            <Sunset className="w-3 h-3 text-[#f59e0b]" />
            <span className="font-mono text-[10px] text-[#888]">{image.lighting_direction}</span>
          </div>
        )}
        {image.character_presence && (
          <div className="flex items-center gap-1 bg-[#1a1a1a] border border-[#222] rounded px-2 py-1">
            <User className="w-3 h-3 text-[#10b981]" />
            <span className="font-mono text-[10px] text-[#888]">{image.character_presence}</span>
          </div>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pt-3 space-y-3">
          {image.style_consistency_summary && (
            <div className="bg-[#0d0d0d] border border-[#1a1a1a] rounded p-3">
              <p className="font-mono text-[9px] text-[#3b7eff] uppercase tracking-widest mb-1">Style Consistency</p>
              <p className="text-xs text-[#777] leading-relaxed">{image.style_consistency_summary}</p>
            </div>
          )}

          {/* Prompt editor */}
          {editingPrompt && hasPrompt ? (
            <div className="space-y-3">
              <div>
                <p className="font-mono text-[9px] text-[#555] uppercase tracking-widest mb-1">Image Prompt</p>
                <Textarea
                  value={editedMainPrompt}
                  onChange={e => setEditedMainPrompt(e.target.value)}
                  className="bg-[#0a0a0a] border-[#2a2a2a] text-foreground font-mono text-xs min-h-24 resize-none"
                />
              </div>
              <div>
                <p className="font-mono text-[9px] text-[#555] uppercase tracking-widest mb-1">Negative Prompt (Avoid)</p>
                <Textarea
                  value={editedNegativePrompt}
                  onChange={e => setEditedNegativePrompt(e.target.value)}
                  className="bg-[#0a0a0a] border-[#2a2a2a] text-foreground font-mono text-xs min-h-16 resize-none"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSavePrompt} className="bg-[#3b7eff] hover:bg-[#2563eb] text-white font-mono text-xs h-7">
                  Save Prompt
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingPrompt(false)} className="text-[#555] hover:text-foreground font-mono text-xs h-7">
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            hasPrompt && image.prompt_used && (
              <div className="bg-[#0d0d0d] border border-[#1a1a1a] rounded p-3">
                <p className="font-mono text-[9px] text-[#555] uppercase tracking-widest mb-1">Generation Prompt</p>
                <p className="text-[10px] text-[#555] font-mono leading-relaxed break-words">
                  {image.prompt_used.slice(0, 300)}{(image.prompt_used?.length || 0) > 300 ? '…' : ''}
                </p>
              </div>
            )
          )}

          {/* Version count */}
          {versionCount > 0 && (
            <p className="font-mono text-[10px] text-[#444]">
              {versionCount} version{versionCount !== 1 ? 's' : ''} saved
              {image.active_version ? ` · v${image.active_version} active` : ''}
            </p>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="px-4 py-3 mt-2 flex flex-wrap gap-2 border-t border-[#1a1a1a]">
        {/* Generate Image */}
        {realProvidersEnabled && providerActive ? (
          <Button
            size="sm"
            onClick={handleGenerateClick}
            disabled={isGenerating || !hasPrompt}
            className="bg-[#3b7eff] hover:bg-[#2563eb] text-white font-mono text-xs h-7"
          >
            {isGenerating ? (
              <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Generating…</>
            ) : hasImage ? (
              <><RefreshCw className="w-3 h-3 mr-1.5" />Regenerate Image</>
            ) : (
              <><ImageIcon className="w-3 h-3 mr-1.5" />Generate Image — Uses Provider Credits</>
            )}
          </Button>
        ) : (
          <div
            className="inline-flex items-center bg-[#1a1a1a] border border-[#333] text-[#555] font-mono text-xs h-7 px-3 rounded-md cursor-not-allowed select-none"
            title={
              !realProvidersEnabled
                ? 'Real image generation is disabled. Enable a provider, upload an image, or create a placeholder preview.'
                : 'No image provider connected.'
            }
            aria-disabled="true"
          >
            <ImageIcon className="w-3 h-3 mr-1.5" />
            Generate Image — Provider Disabled
          </div>
        )}

        {/* Upload scene image */}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => fileInputRef.current?.click()}
          className="text-[#3b7eff] hover:text-blue-300 border border-[#3b7eff]/30 font-mono text-xs h-7"
        >
          <Upload className="w-3 h-3 mr-1.5" />
          Upload Scene Image
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Create placeholder preview */}
        {!image.placeholder && !hasImage && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onCreatePlaceholder(image.id)}
            className="text-[#888] hover:text-foreground border border-[#333] font-mono text-xs h-7"
          >
            <FileImage className="w-3 h-3 mr-1.5" />
            Create Placeholder Preview
          </Button>
        )}

        {/* Use placeholder as draft final */}
        {image.placeholder && !image.use_placeholder_as_draft_final && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowPlaceholderDraftConfirm(true)}
            className="text-[#f59e0b] hover:text-amber-300 border border-[#f59e0b]/30 font-mono text-xs h-7"
          >
            <AlertTriangle className="w-3 h-3 mr-1.5" />
            Use Placeholder As Draft Final
          </Button>
        )}

        {hasPrompt && !editingPrompt && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setEditedMainPrompt(prompt!.main_image_prompt || ''); setEditedNegativePrompt(prompt!.negative_prompt || ''); setEditingPrompt(true); setExpanded(true); }}
            className="text-[#555] hover:text-foreground border border-[#222] font-mono text-xs h-7"
          >
            <Edit3 className="w-3 h-3 mr-1.5" />Edit Prompt
          </Button>
        )}

        {versionCount > 1 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onCompare(image)}
            className="text-[#8b5cf6] hover:text-[#a78bfa] border border-[#8b5cf6]/30 font-mono text-xs h-7"
          >
            <GitCompare className="w-3 h-3 mr-1.5" />Compare ({versionCount})
          </Button>
        )}

        {/* Approve — only for real or manually uploaded or accepted placeholder */}
        {!image.approved && (image.real_generated || image.manual_upload || image.use_placeholder_as_draft_final) &&
          image.generation_status !== 'pending' && image.generation_status !== 'provider_disabled' && (
          <Button
            size="sm"
            onClick={() => onApprove(image.id)}
            className="bg-[#10b981]/20 hover:bg-[#10b981]/30 text-[#10b981] border border-[#10b981]/30 font-mono text-xs h-7"
          >
            <CheckCircle2 className="w-3 h-3 mr-1.5" />Approve Image
          </Button>
        )}

        {!image.approved &&
          (image.real_generated || image.manual_upload) &&
          !image.rejected && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onReject(image.id)}
            className="text-[#ef4444] hover:text-[#f87171] border border-[#ef4444]/20 font-mono text-xs h-7"
          >
            <XCircle className="w-3 h-3 mr-1.5" />Reject
          </Button>
        )}

        {image.approved && (
          <div className="flex items-center gap-1.5 ml-auto">
            <CheckCircle2 className="w-4 h-4 text-[#10b981]" />
            <span className="font-mono text-xs text-[#10b981]">Approved</span>
          </div>
        )}
      </div>

      {/* Disabled generate explainer (shown below buttons when provider is off) */}
      {!realProvidersEnabled && (
        <div
          className="mx-4 mb-3 flex items-start gap-2 rounded-lg px-3 py-2"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <Info className="w-3 h-3 text-[#555] shrink-0 mt-0.5" />
          <p className="text-[10px] text-[#555] leading-relaxed">
            Real image generation is disabled. Enable a provider in Image Provider Settings, upload an image manually, or create a placeholder preview for planning.
          </p>
        </div>
      )}

      {/* Placeholder as Draft confirmation */}
      <AlertDialog open={showPlaceholderDraftConfirm} onOpenChange={setShowPlaceholderDraftConfirm}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              Use Placeholder As Draft Final?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This is a placeholder preview, not a real generated image. You can use it for
              draft video rendering and planning, but final production should use generated or
              uploaded images. The placeholder will be clearly labeled throughout the workflow.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-500 hover:bg-amber-600 text-white"
              onClick={() => { onUsePlaceholderAsDraft(image.id); setShowPlaceholderDraftConfirm(false); }}
            >
              Use as Draft Final
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
