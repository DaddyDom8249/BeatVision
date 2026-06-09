import type { ScenePreview, SceneVisualPrompt } from '@/types/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Camera, MapPin, Gem, Palette, Play, CheckCircle2 } from 'lucide-react';

interface Props {
  previews: ScenePreview[];
  prompts: SceneVisualPrompt[];
  generating: boolean;
}

// Generates a deterministic gradient for a scene's preview card based on its index + colors
function getSceneGradient(index: number, dominantColors: string | null): string {
  const palettes = [
    'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
    'linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)',
    'linear-gradient(135deg, #0d0d0d, #1a0533, #2d1b69)',
    'linear-gradient(135deg, #0a0a0a, #1f1f3d, #3b1f5e)',
    'linear-gradient(135deg, #030303, #1a0a1f, #2e0854)',
    'linear-gradient(135deg, #040404, #0d1b2a, #1b4332)',
    'linear-gradient(135deg, #0d0d0d, #2d1515, #4a1a1a)',
  ];
  return palettes[index % palettes.length];
}

function PreviewCard({ preview, prompt, index }: { preview: ScenePreview; prompt?: SceneVisualPrompt; index: number }) {
  const gradient = getSceneGradient(index, preview.dominant_colors);

  // Parse dominant colors for display swatches
  const colorParts = preview.dominant_colors?.split(',').map((c) => c.trim()).slice(0, 4) ?? [];

  return (
    <Card className="border-white/10 overflow-hidden h-full flex flex-col" style={{ background: 'rgba(255,255,255,0.03)' }}>
      {/* Cinematic visual area */}
      <div
        className="relative w-full overflow-hidden flex items-end"
        style={{
          background: gradient,
          aspectRatio: '16/9',
          minHeight: 160,
        }}
      >
        {/* Film grain overlay */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.15'/%3E%3C/svg%3E")`,
          }}
        />
        {/* Scene number badge */}
        <div className="absolute top-3 left-3 z-10">
          <div
            className="flex items-center justify-center w-7 h-7 rounded font-bold text-xs"
            style={{ background: 'rgba(0,0,0,0.6)', color: '#3b7eff', border: '1px solid rgba(59,126,255,0.4)' }}
          >
            {preview.scene_visual_prompt_id ? (prompt?.scene_number ?? index + 1) : index + 1}
          </div>
        </div>
        {/* Camera direction badge */}
        {preview.camera_direction && (
          <div className="absolute top-3 right-3 z-10">
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded text-xs"
              style={{ background: 'rgba(0,0,0,0.65)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <Camera className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate max-w-[120px]">{preview.camera_direction}</span>
            </div>
          </div>
        )}
        {/* Generate preview button placeholder */}
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: 'rgba(59,126,255,0.3)', color: '#93c5fd', border: '1px solid rgba(59,126,255,0.4)' }}
          >
            <Play className="h-3 w-3" />
            Image generation ready
          </div>
        </div>
        {/* Bottom vignette with title */}
        <div
          className="absolute inset-x-0 bottom-0 px-3 pb-3 pt-8 z-10"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)' }}
        >
          <p className="text-white font-semibold text-sm leading-tight text-balance">
            {preview.preview_title || `Scene ${index + 1}`}
          </p>
        </div>
        {/* Color swatches */}
        {colorParts.length > 0 && (
          <div className="absolute bottom-3 right-3 flex gap-1 z-20">
            {colorParts.map((color, ci) => (
              <div
                key={ci}
                className="w-3 h-3 rounded-full border border-white/20"
                style={{ background: color.startsWith('#') ? color : `hsl(${ci * 60}, 50%, 50%)` }}
                title={color}
              />
            ))}
          </div>
        )}
      </div>

      {/* Card content */}
      <CardContent className="p-4 flex-1 flex flex-col gap-3">
        {preview.preview_description && (
          <p className="text-sm text-white/70 leading-relaxed text-pretty flex-1">
            {preview.preview_description}
          </p>
        )}
        <div className="space-y-2">
          {preview.mood && (
            <div className="flex items-center gap-2">
              <Palette className="h-3 w-3 shrink-0" style={{ color: '#8b5cf6' }} />
              <span className="text-xs text-white/50">Mood:</span>
              <span className="text-xs text-white/75 font-medium">{preview.mood}</span>
            </div>
          )}
          {preview.location && (
            <div className="flex items-center gap-2">
              <MapPin className="h-3 w-3 shrink-0" style={{ color: '#10b981' }} />
              <span className="text-xs text-white/50">Location:</span>
              <span className="text-xs text-white/75 font-medium">{preview.location}</span>
            </div>
          )}
          {preview.symbolic_object && (
            <div className="flex items-center gap-2">
              <Gem className="h-3 w-3 shrink-0" style={{ color: '#f59e0b' }} />
              <span className="text-xs text-white/50">Symbol:</span>
              <span className="text-xs text-white/75 font-medium">{preview.symbolic_object}</span>
            </div>
          )}
        </div>
        {preview.placeholder_visual && (
          <div
            className="p-2.5 rounded text-xs text-white/50 italic leading-relaxed text-pretty"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.1)' }}
          >
            Art direction: {preview.placeholder_visual}
          </div>
        )}
        {preview.approved && (
          <Badge className="bg-green-500/20 text-green-400 border-green-500/30 self-start flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />Preview Approved
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

export default function ScenePreviewCardsSection({ previews, prompts, generating }: Props) {
  const promptMap = Object.fromEntries(prompts.map((p) => [p.id, p]));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 min-w-0">
        <Play className="h-5 w-5 shrink-0" style={{ color: '#f59e0b' }} />
        <h3 className="text-lg font-semibold text-white text-balance">Scene Preview Cards</h3>
        {previews.length > 0 && (
          <Badge variant="outline" className="border-white/20 text-white/50 text-xs shrink-0">
            {previews.length} scenes
          </Badge>
        )}
      </div>

      {generating && previews.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="border-white/10 overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <Skeleton className="w-full bg-white/10" style={{ aspectRatio: '16/9' }} />
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-4 w-3/4 bg-white/10" />
                <Skeleton className="h-10 w-full bg-white/10" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!generating && previews.length === 0 && (
        <Card className="border-dashed border-white/20" style={{ background: 'rgba(245,158,11,0.05)' }}>
          <CardContent className="p-8 text-center space-y-3">
            <Play className="h-10 w-10 mx-auto opacity-40" style={{ color: '#f59e0b' }} />
            <p className="text-white/60 text-sm text-pretty">
              Scene preview cards will appear here after world generation. Each card gives you a cinematic frame-by-frame vision of your music video.
            </p>
          </CardContent>
        </Card>
      )}

      {previews.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {previews.map((preview, i) => (
            <PreviewCard
              key={preview.id}
              preview={preview}
              prompt={preview.scene_visual_prompt_id ? promptMap[preview.scene_visual_prompt_id] : undefined}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}
