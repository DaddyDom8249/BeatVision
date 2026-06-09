import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, RefreshCw, Loader2, Film } from 'lucide-react';
import { SceneImage, SceneImageVersion, SceneVisualPrompt } from '@/types/types';

type Filter = 'all' | 'approved' | 'review' | 'rejected';

interface Props {
  images: SceneImage[];
  versionMap: Record<string, SceneImageVersion[]>;
  prompts: SceneVisualPrompt[];
  generatingIds: Set<string>;
  onRegenerate: (sceneImageId: string, promptId: string) => void;
  onApprove: (sceneImageId: string) => void;
}

const FILTERS: { label: string; value: Filter }[] = [
  { label: 'All Scenes', value: 'all' },
  { label: 'Approved', value: 'approved' },
  { label: 'Needs Review', value: 'review' },
  { label: 'Rejected / Redo', value: 'rejected' },
];

export default function ImageReviewMode({ images, versionMap, prompts, generatingIds, onRegenerate, onApprove }: Props) {
  const [filter, setFilter] = useState<Filter>('all');

  const promptMap = Object.fromEntries(prompts.map(p => [p.storyboard_scene_id || p.id, p]));

  const filtered = images.filter(img => {
    if (filter === 'approved') return img.approved;
    if (filter === 'rejected') return img.rejected;
    if (filter === 'review') return !img.approved && !img.rejected && img.generation_status !== 'pending';
    return true;
  });

  const sorted = [...filtered].sort((a, b) => a.scene_number - b.scene_number);

  const approvedCount = images.filter(i => i.approved).length;
  const reviewCount = images.filter(i => !i.approved && !i.rejected && i.generation_status !== 'pending').length;
  const rejectedCount = images.filter(i => i.rejected).length;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="bg-[#111] border border-[#222] rounded p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-mono text-xs font-semibold tracking-widest text-[#8b5cf6] uppercase">
            Review Progress
          </h3>
          <span className="font-mono text-xs text-[#555]">
            {approvedCount}/{images.length} approved
          </span>
        </div>
        <div className="w-full h-1 bg-[#1e1e1e] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#10b981] transition-all duration-500"
            style={{ width: images.length > 0 ? `${(approvedCount / images.length) * 100}%` : '0%' }}
          />
        </div>
        <div className="flex gap-4 mt-3">
          <span className="font-mono text-[10px] text-[#10b981]">{approvedCount} approved</span>
          <span className="font-mono text-[10px] text-[#f59e0b]">{reviewCount} needs review</span>
          <span className="font-mono text-[10px] text-[#ef4444]">{rejectedCount} rejected</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`font-mono text-xs px-3 py-1.5 rounded border transition-all ${
              filter === f.value
                ? 'bg-[#8b5cf6]/20 border-[#8b5cf6]/50 text-[#8b5cf6]'
                : 'bg-[#111] border-[#222] text-[#555] hover:text-foreground hover:border-[#333]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Scene list */}
      {sorted.length === 0 ? (
        <div className="bg-[#111] border border-[#222] rounded p-8 text-center">
          <Film className="w-8 h-8 text-[#333] mx-auto mb-3" />
          <p className="font-mono text-sm text-[#555]">No scenes match this filter.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(img => {
            const prompt = Object.values(promptMap).find(
              p => p.storyboard_scene_id === img.storyboard_scene_id
            );
            const isGenerating = generatingIds.has(img.id);
            const versionCount = (versionMap[img.id] || []).length;

            return (
              <div
                key={img.id}
                className={`bg-[#111] border rounded p-3 flex items-center gap-3 transition-all ${
                  img.approved
                    ? 'border-[#10b981]/30'
                    : img.rejected
                    ? 'border-[#ef4444]/20'
                    : 'border-[#1e1e1e]'
                }`}
              >
                {/* Scene number */}
                <span className="font-mono text-xs text-[#3b7eff] font-bold shrink-0 w-6 text-center">
                  {String(img.scene_number).padStart(2, '0')}
                </span>

                {/* Thumbnail or placeholder */}
                <div className="w-16 h-9 rounded overflow-hidden bg-[#0a0a0a] shrink-0 relative flex items-center justify-center">
                  {img.image_url ? (
                    <img src={img.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Film className="w-4 h-4 text-[#333]" />
                  )}
                </div>

                {/* Title + mood */}
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs font-semibold text-foreground truncate">
                    {img.scene_title || `Scene ${img.scene_number}`}
                  </p>
                  <p className="font-mono text-[10px] text-[#555] truncate">
                    {img.mood || ''}{img.timestamp_range ? ` · ${img.timestamp_range}` : ''}
                    {versionCount > 0 ? ` · ${versionCount}v` : ''}
                  </p>
                </div>

                {/* Status indicator */}
                <div className="shrink-0">
                  {img.approved ? (
                    <CheckCircle2 className="w-4 h-4 text-[#10b981]" />
                  ) : img.rejected ? (
                    <XCircle className="w-4 h-4 text-[#ef4444]" />
                  ) : img.generation_status === 'generating' ? (
                    <Loader2 className="w-4 h-4 text-[#3b7eff] animate-spin" />
                  ) : img.generation_status === 'generated' ? (
                    <span className="w-2 h-2 rounded-full bg-[#f59e0b] block" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-[#333] block" />
                  )}
                </div>

                {/* Quick actions */}
                <div className="flex gap-1 shrink-0">
                  {!img.approved && img.generation_status !== 'pending' && (
                    <Button
                      size="sm"
                      onClick={() => onApprove(img.id)}
                      className="h-7 px-2 bg-[#10b981]/20 hover:bg-[#10b981]/30 text-[#10b981] border border-[#10b981]/30 font-mono text-[10px]"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                    </Button>
                  )}
                  {(img.rejected || img.generation_status !== 'pending') && prompt && (
                    <Button
                      size="sm"
                      onClick={() => onRegenerate(img.id, prompt.id)}
                      disabled={isGenerating}
                      className="h-7 px-2 bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-[#aaa] font-mono text-[10px]"
                    >
                      {isGenerating ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
