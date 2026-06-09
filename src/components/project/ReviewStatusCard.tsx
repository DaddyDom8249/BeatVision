import { CheckCircle2, AlertTriangle, Clock, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface ReviewStatusCardProps {
  totalApproved: number;
  totalUpdatedAfterApproval: number;
  totalNeedsReview: number;
  isReadyToContinue: boolean;
  nextPhaseName?: string;
  creatorChoseKeep?: boolean;
}

export default function ReviewStatusCard({
  totalApproved,
  totalUpdatedAfterApproval,
  totalNeedsReview,
  isReadyToContinue,
  nextPhaseName = 'the next phase',
  creatorChoseKeep = false,
}: ReviewStatusCardProps) {
  return (
    <Card
      className="border"
      style={{
        background: isReadyToContinue
          ? 'rgba(16,185,129,0.05)'
          : 'rgba(229,169,60,0.04)',
        borderColor: isReadyToContinue
          ? 'rgba(16,185,129,0.2)'
          : 'rgba(229,169,60,0.2)',
      }}
    >
      <CardContent className="p-4">
        {/* Stat row */}
        <div className="flex flex-wrap gap-4 mb-3">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
            <span className="text-xs text-white/60">
              <span className="text-white font-semibold">{totalApproved}</span> approved
            </span>
          </div>
          {totalUpdatedAfterApproval > 0 && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-xs text-white/60">
                <span className="text-amber-300 font-semibold">{totalUpdatedAfterApproval}</span> updated after approval
              </span>
            </div>
          )}
          {totalNeedsReview > 0 && (
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-400 shrink-0" />
              <span className="text-xs text-white/60">
                <span className="text-orange-300 font-semibold">{totalNeedsReview}</span> needs review
              </span>
            </div>
          )}
        </div>

        {/* Status message */}
        <div className="flex items-start gap-2">
          {isReadyToContinue ? (
            <ShieldCheck className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          )}
          <p className="text-sm text-pretty leading-relaxed" style={{ color: isReadyToContinue ? '#86efac' : '#fcd34d' }}>
            {isReadyToContinue
              ? 'All changes have been reviewed. BeatVision is ready to continue.'
              : totalNeedsReview > 0
              ? `${totalNeedsReview} section${totalNeedsReview > 1 ? 's' : ''} need${totalNeedsReview === 1 ? 's' : ''} review before BeatVision can continue to ${nextPhaseName}.`
              : `${totalUpdatedAfterApproval} section${totalUpdatedAfterApproval > 1 ? 's were' : ' was'} updated after approval.`}
          </p>
        </div>

        {/* Creator chose keep reminder */}
        {creatorChoseKeep && (
          <div
            className="mt-3 rounded-lg px-3 py-2.5 border text-xs text-white/55 text-pretty leading-relaxed"
            style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
          >
            <span className="text-white/70 font-medium">Note: </span>
            Some approved sections were changed after approval. Later sections were kept unchanged by creator choice.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
