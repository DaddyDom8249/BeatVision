import { useState } from 'react';
import { ChevronDown, ChevronUp, ScrollText, CheckCircle2, Clock, AlertTriangle, RotateCcw, Edit3, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ProjectChangeLog, ChangeType, ChangeReviewStatus } from '@/types/types';

interface Props {
  logs: ProjectChangeLog[];
}

function changeTypeLabel(ct: ChangeType): string {
  switch (ct) {
    case 'edited_after_approval': return 'Edited after approval';
    case 'regenerated_after_approval': return 'Regenerated after approval';
    case 'marked_downstream_needs_review': return 'Marked downstream sections as needs review';
    case 'reapproved': return 'Reapproved';
    case 'kept_later_sections_unchanged': return 'Kept later sections unchanged';
    default: return ct;
  }
}

function ChangeTypeIcon({ ct }: { ct: ChangeType }) {
  if (ct === 'edited_after_approval') return <Edit3 className="w-3 h-3" />;
  if (ct === 'regenerated_after_approval') return <RefreshCw className="w-3 h-3" />;
  if (ct === 'marked_downstream_needs_review') return <AlertTriangle className="w-3 h-3" />;
  if (ct === 'reapproved') return <CheckCircle2 className="w-3 h-3" />;
  if (ct === 'kept_later_sections_unchanged') return <RotateCcw className="w-3 h-3" />;
  return <Clock className="w-3 h-3" />;
}

function reviewStatusBadge(rs: ChangeReviewStatus) {
  if (rs === 'reapproved') {
    return <Badge className="text-xs bg-sky-500/10 text-sky-400 border-sky-500/25">Reapproved</Badge>;
  }
  if (rs === 'reviewed') {
    return <Badge className="text-xs bg-green-500/10 text-green-400 border-green-500/25">Reviewed</Badge>;
  }
  if (rs === 'skipped') {
    return <Badge className="text-xs bg-white/5 text-white/40 border-white/10">Skipped</Badge>;
  }
  return <Badge className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/25">Pending</Badge>;
}

export default function ProjectChangeLogSection({ logs }: Props) {
  const [open, setOpen] = useState(false);

  if (logs.length === 0) return null;

  return (
    <div className="space-y-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 group"
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <ScrollText className="w-4 h-4 text-white/50" />
          </div>
          <div className="text-left">
            <h2 className="text-sm font-semibold text-white/80 group-hover:text-white transition-colors">Project Change Log</h2>
            <p className="text-xs text-white/35">{logs.length} change{logs.length !== 1 ? 's' : ''} recorded</p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-white/30 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-white/30 shrink-0" />
        )}
      </button>

      {open && (
        <div className="space-y-2.5">
          {logs.slice().reverse().map((log) => (
            <Card
              key={log.id}
              className="border overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.07)' }}
            >
              <CardHeader className="p-3 pb-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="flex items-center justify-center w-5 h-5 rounded shrink-0"
                      style={{ background: 'rgba(229,169,60,0.12)', color: '#E5A93C' }}
                    >
                      <ChangeTypeIcon ct={log.change_type} />
                    </span>
                    <CardTitle className="text-xs font-semibold text-white/80 truncate">
                      {log.section_name}
                    </CardTitle>
                    {reviewStatusBadge(log.review_status)}
                  </div>
                  <span className="text-xs text-white/25 shrink-0">
                    {new Date(log.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-white/30">Change type:</span>
                  <span className="text-xs text-white/60">{changeTypeLabel(log.change_type)}</span>
                </div>
                {log.change_summary && (
                  <div className="flex items-start gap-1.5">
                    <span className="text-xs text-white/30 shrink-0">Summary:</span>
                    <span className="text-xs text-white/55 text-pretty">{log.change_summary}</span>
                  </div>
                )}
                {log.user_choice && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-white/30">Creator chose:</span>
                    <span className="text-xs text-white/55">{log.user_choice}</span>
                  </div>
                )}
                {log.affected_sections.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className="text-xs text-white/30">Affected:</span>
                    {log.affected_sections.map((s) => (
                      <span
                        key={s}
                        className="text-xs px-1.5 py-0.5 rounded border"
                        style={{ background: 'rgba(229,169,60,0.07)', borderColor: 'rgba(229,169,60,0.18)', color: 'rgba(229,169,60,0.7)' }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
