import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, X, Film } from 'lucide-react';
import { SceneImage, SceneImageVersion } from '@/types/types';

interface Props {
  sceneImage: SceneImage;
  versions: SceneImageVersion[];
  onSelectVersion: (sceneImageId: string, version: SceneImageVersion) => void;
  onClose: () => void;
}

export default function CompareVersionsModal({ sceneImage, versions, onSelectVersion, onClose }: Props) {
  const sorted = [...versions].sort((a, b) => a.version_number - b.version_number);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#111] border border-[#222] rounded w-full max-w-[calc(100%-2rem)] md:max-w-3xl max-h-[90dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1e1e] sticky top-0 bg-[#111] z-10">
          <div>
            <h2 className="font-mono text-sm font-bold text-foreground">
              Compare Versions — Scene {String(sceneImage.scene_number).padStart(2, '0')}
            </h2>
            <p className="font-mono text-[10px] text-[#555] mt-0.5">
              {sceneImage.scene_title} · {sorted.length} version{sorted.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#555] hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Version grid */}
        <div className="p-5 space-y-4">
          {sorted.length === 0 ? (
            <div className="text-center py-12">
              <Film className="w-8 h-8 text-[#333] mx-auto mb-3" />
              <p className="font-mono text-sm text-[#555]">No versions saved yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sorted.map(version => {
                const isActive = sceneImage.active_version === version.version_number;
                return (
                  <div
                    key={version.id}
                    className={`bg-[#0d0d0d] border rounded overflow-hidden transition-all ${
                      isActive ? 'border-[#10b981]/50' : 'border-[#1e1e1e] hover:border-[#333]'
                    }`}
                  >
                    {/* Image or placeholder */}
                    <div className="w-full aspect-video bg-[#0a0a0a] relative flex items-center justify-center">
                      {version.image_url ? (
                        <img
                          src={version.image_url}
                          alt={`Version ${version.version_number}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <Film className="w-8 h-8 text-[#333]" />
                          <span className="font-mono text-[10px] text-[#444]">Placeholder v{version.version_number}</span>
                        </div>
                      )}

                      {/* Version badge */}
                      <div className="absolute top-2 left-2">
                        <span className="font-mono text-[10px] bg-black/70 text-[#aaa] px-2 py-0.5 rounded">
                          v{version.version_number}
                        </span>
                      </div>

                      {/* Active badge */}
                      {isActive && (
                        <div className="absolute top-2 right-2">
                          <Badge className="bg-[#10b981]/20 text-[#10b981] border-[#10b981]/30 font-mono text-[9px]">
                            ACTIVE
                          </Badge>
                        </div>
                      )}

                      {/* Approved badge */}
                      {version.approved && (
                        <div className="absolute bottom-2 right-2">
                          <CheckCircle2 className="w-4 h-4 text-[#10b981]" />
                        </div>
                      )}
                    </div>

                    {/* Version info */}
                    <div className="px-3 py-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] text-[#555]">
                          {new Date(version.created_at).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {version.approved && (
                          <span className="font-mono text-[10px] text-[#10b981]">Approved</span>
                        )}
                      </div>

                      {version.notes && (
                        <p className="text-[10px] text-[#666] leading-relaxed">{version.notes}</p>
                      )}

                      {version.prompt_used && (
                        <p className="font-mono text-[9px] text-[#444] line-clamp-2 leading-relaxed">
                          {version.prompt_used.slice(0, 100)}…
                        </p>
                      )}

                      {!isActive && (
                        <Button
                          size="sm"
                          onClick={() => onSelectVersion(sceneImage.id, version)}
                          className="w-full h-7 bg-[#3b7eff]/20 hover:bg-[#3b7eff]/30 text-[#3b7eff] border border-[#3b7eff]/30 font-mono text-[10px]"
                        >
                          Set as Active Version
                        </Button>
                      )}

                      {isActive && (
                        <div className="flex items-center justify-center gap-1.5 py-1">
                          <CheckCircle2 className="w-3 h-3 text-[#10b981]" />
                          <span className="font-mono text-[10px] text-[#10b981]">This is the active version</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#1e1e1e] flex justify-end">
          <Button
            variant="ghost"
            onClick={onClose}
            className="font-mono text-xs text-[#555] hover:text-foreground border border-[#222] h-8"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
