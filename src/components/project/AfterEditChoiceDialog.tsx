import { AlertTriangle, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { SECTION_WARNINGS, DOWNSTREAM_DEPS } from '@/hooks/useReviewChanges';

interface Props {
  open: boolean;
  sectionType: string;
  sectionName: string;
  onMarkDownstream: () => void;
  onKeepUnchanged: () => void;
  onClose: () => void;
}

export default function AfterEditChoiceDialog({
  open,
  sectionType,
  sectionName,
  onMarkDownstream,
  onKeepUnchanged,
  onClose,
}: Props) {
  const warning = SECTION_WARNINGS[sectionType] || `You changed ${sectionName}.`;
  const affected = DOWNSTREAM_DEPS[sectionType] || [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-[calc(100%-2rem)] md:max-w-lg border-amber-500/30"
        style={{ background: 'rgba(18,18,18,0.97)', borderColor: 'rgba(229,169,60,0.3)' }}
      >
        <DialogHeader>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(229,169,60,0.15)' }}>
              <AlertTriangle className="w-4 h-4" style={{ color: '#E5A93C' }} />
            </div>
            <DialogTitle className="text-white text-base font-semibold text-balance">
              You changed an approved section
            </DialogTitle>
          </div>
          <DialogDescription className="text-white/60 text-sm text-pretty leading-relaxed">
            {warning}
          </DialogDescription>
        </DialogHeader>

        {affected.length > 0 && (
          <div className="rounded-lg border border-white/10 p-3 space-y-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/40">
              Sections that may be affected
            </p>
            <div className="flex flex-wrap gap-1.5">
              {affected.map((s) => (
                <span
                  key={s}
                  className="text-xs px-2 py-0.5 rounded-full border"
                  style={{ background: 'rgba(229,169,60,0.1)', borderColor: 'rgba(229,169,60,0.25)', color: '#E5A93C' }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="text-sm text-white/70 font-medium">What would you like BeatVision to do?</p>

        <div className="space-y-2.5">
          {/* Option 1: Mark downstream */}
          <button
            onClick={onMarkDownstream}
            className="w-full text-left rounded-xl border p-4 transition-colors group hover:border-orange-400/50"
            style={{ background: 'rgba(249,115,22,0.06)', borderColor: 'rgba(249,115,22,0.25)' }}
          >
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(249,115,22,0.15)' }}>
                <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white group-hover:text-orange-300 transition-colors">
                  Mark affected sections as Needs Review
                </p>
                <p className="text-xs text-white/50 mt-0.5 text-pretty">
                  BeatVision will flag later sections so you can check they still match your updated vision.
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-orange-400 transition-colors shrink-0 mt-1 ml-auto" />
            </div>
          </button>

          {/* Option 2: Keep unchanged */}
          <button
            onClick={onKeepUnchanged}
            className="w-full text-left rounded-xl border p-4 transition-colors group hover:border-white/30"
            style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.12)' }}
          >
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <ArrowRight className="w-3.5 h-3.5 text-white/60" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white/80 group-hover:text-white transition-colors">
                  Keep later sections as they are
                </p>
                <p className="text-xs text-white/40 mt-0.5 text-pretty">
                  Keep all other approved sections unchanged. A reminder will appear that later sections may not perfectly match your edit.
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors shrink-0 mt-1 ml-auto" />
            </div>
          </button>
        </div>

        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 w-7 h-7 rounded-md flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </DialogContent>
    </Dialog>
  );
}
