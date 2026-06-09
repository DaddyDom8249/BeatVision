import { CheckCircle2, AlertTriangle, Clock, Info, RotateCcw, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export type ReviewSectionStatus = 'Approved' | 'Updated After Approval' | 'Needs Review' | 'Reapproved';

export interface AffectedSectionItem {
  id: string;
  sectionType: string;
  sectionName: string;
  status: ReviewSectionStatus;
  whatChanged: string;
  whatItMayAffect: string[];
  lastEditedAt: string | null;
  canKeepUnchanged?: boolean;
  // Scroll anchor
  scrollTo?: () => void;
  onReapprove?: () => void;
  onKeepUnchanged?: () => void;
  onReview?: () => void;
}

interface ReviewStatusBadgeProps {
  status: ReviewSectionStatus;
}

export function ReviewStatusBadge({ status }: ReviewStatusBadgeProps) {
  if (status === 'Approved') {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-green-500/10 text-green-400 border-green-500/25">
        <CheckCircle2 className="w-3 h-3" /> Approved
      </span>
    );
  }
  if (status === 'Reapproved') {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-sky-500/10 text-sky-400 border-sky-500/25">
        <CheckCircle2 className="w-3 h-3" /> Reapproved
      </span>
    );
  }
  if (status === 'Updated After Approval') {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/25">
        <Clock className="w-3 h-3" /> Updated After Approval
      </span>
    );
  }
  // Needs Review
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-orange-500/10 text-orange-400 border-orange-500/25">
      <AlertTriangle className="w-3 h-3" /> Needs Review
    </span>
  );
}

interface AffectedItemCardProps {
  item: AffectedSectionItem;
  viewedIds: Set<string>;
  onMarkViewed: (id: string) => void;
}

function AffectedItemCard({ item, viewedIds, onMarkViewed }: AffectedItemCardProps) {
  const isViewed = viewedIds.has(item.id);

  const handleReview = () => {
    onMarkViewed(item.id);
    item.scrollTo?.();
    item.onReview?.();
  };

  const borderColor =
    item.status === 'Needs Review'
      ? 'rgba(249,115,22,0.25)'
      : item.status === 'Updated After Approval'
      ? 'rgba(229,169,60,0.25)'
      : item.status === 'Reapproved'
      ? 'rgba(14,165,233,0.2)'
      : 'rgba(34,197,94,0.2)';

  return (
    <Card
      className="border overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)', borderColor }}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{item.sectionName}</p>
            <ReviewStatusBadge status={item.status} />
          </div>
          {item.lastEditedAt && (
            <span className="text-xs text-white/30 shrink-0">
              {new Date(item.lastEditedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
        </div>

        {/* What changed */}
        <div className="text-xs text-white/60 leading-relaxed text-pretty">
          <span className="text-white/40 mr-1">Changed:</span>
          {item.whatChanged}
        </div>

        {/* What it may affect */}
        {item.whatItMayAffect.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-white/30">May affect:</span>
            {item.whatItMayAffect.map((s) => (
              <span
                key={s}
                className="text-xs px-1.5 py-0.5 rounded border"
                style={{ background: 'rgba(229,169,60,0.07)', borderColor: 'rgba(229,169,60,0.2)', color: 'rgba(229,169,60,0.8)' }}
              >
                {s}
              </span>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap pt-0.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleReview}
            className="h-7 px-2.5 text-xs border border-white/15 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <Eye className="w-3 h-3 mr-1" />
            {isViewed ? 'Reviewed' : 'Review'}
          </Button>
          {item.onReapprove && (
            <Button
              size="sm"
              onClick={item.onReapprove}
              className="h-7 px-2.5 text-xs text-white font-medium"
              style={{ background: 'linear-gradient(135deg,#10b981,#3b7eff)' }}
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Reapprove
            </Button>
          )}
          {item.canKeepUnchanged && item.onKeepUnchanged && (
            <Button
              size="sm"
              variant="ghost"
              onClick={item.onKeepUnchanged}
              className="h-7 px-2.5 text-xs border border-white/10 text-white/40 hover:text-white/70"
            >
              Keep as is
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface ReviewChangesPanelProps {
  items: AffectedSectionItem[];
  viewedIds: Set<string>;
  onMarkViewed: (id: string) => void;
  onReviewAll: () => void;
  onReapproveAll: () => void;
}

export default function ReviewChangesPanel({
  items,
  viewedIds,
  onMarkViewed,
  onReviewAll,
  onReapproveAll,
}: ReviewChangesPanelProps) {
  if (items.length === 0) return null;

  const needsReviewCount = items.filter((i) => i.status === 'Needs Review').length;
  const updatedCount = items.filter((i) => i.status === 'Updated After Approval').length;
  const totalNeedingAction = needsReviewCount + updatedCount;
  const allViewed = items.every((i) => viewedIds.has(i.id));

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ background: 'rgba(229,169,60,0.04)', borderColor: 'rgba(229,169,60,0.2)' }}
    >
      {/* Panel header */}
      <div
        className="px-5 py-4 border-b flex items-start gap-3"
        style={{ borderColor: 'rgba(229,169,60,0.15)', background: 'rgba(229,169,60,0.07)' }}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: 'rgba(229,169,60,0.15)' }}
        >
          <AlertTriangle className="w-4.5 h-4.5" style={{ color: '#E5A93C' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-white text-balance">Review Changes</h2>
          <p className="text-xs text-white/55 mt-0.5 text-pretty">
            Some approved parts of your project have changed. Review the affected sections before continuing.
          </p>
        </div>
      </div>

      {/* Summary bar */}
      <div className="px-5 py-3 flex items-center gap-4 flex-wrap border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {needsReviewCount > 0 && (
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-xs text-orange-300 font-medium">{needsReviewCount} needs review</span>
          </div>
        )}
        {updatedCount > 0 && (
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs text-amber-300 font-medium">{updatedCount} updated after approval</span>
          </div>
        )}
        {totalNeedingAction === 0 && (
          <div className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-xs text-sky-300 font-medium">All changes reviewed</span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={onReviewAll}
            className="h-7 px-2.5 text-xs border border-white/15 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <Eye className="w-3 h-3 mr-1" />
            Review All Changes
          </Button>
          <Button
            size="sm"
            onClick={onReapproveAll}
            disabled={!allViewed}
            className="h-7 px-2.5 text-xs text-white font-medium disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#10b981,#3b7eff)' }}
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Reapprove All
          </Button>
        </div>
      </div>

      {/* Items */}
      <div className="p-4 space-y-3">
        {items.map((item) => (
          <AffectedItemCard
            key={item.id}
            item={item}
            viewedIds={viewedIds}
            onMarkViewed={onMarkViewed}
          />
        ))}
      </div>

      {!allViewed && (
        <div className="px-5 pb-4">
          <p className="text-xs text-white/35 text-center text-pretty">
            Review all changed sections to enable Reapprove All.
          </p>
        </div>
      )}
    </div>
  );
}
