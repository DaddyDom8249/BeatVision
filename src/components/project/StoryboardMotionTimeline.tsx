import { useState } from 'react';
import { CheckCircle2, Edit3, RefreshCw, Eye, ChevronDown, ChevronUp, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { SceneMotionPlan, SceneImage, MotionSettings } from '@/types/types';
import { MOTION_EFFECTS, TRANSITION_STYLES } from '@/types/types';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import MotionPreviewModal from './MotionPreviewModal';

interface Props {
  projectId: string;
  plans: SceneMotionPlan[];
  sceneImages: SceneImage[];
  motionSettings: MotionSettings | null;
  onPlansUpdate: (plans: SceneMotionPlan[]) => void;
}

// Build a safe insert/update payload — only DB columns, all with safe defaults
function buildPlanPayload(
  projectId: string,
  plan: Partial<SceneMotionPlan>,
  base?: SceneMotionPlan,
): Record<string, unknown> {
  return {
    project_id: projectId,
    storyboard_scene_id: plan.storyboard_scene_id ?? base?.storyboard_scene_id ?? null,
    scene_image_id: plan.scene_image_id ?? base?.scene_image_id ?? null,
    scene_number: plan.scene_number ?? base?.scene_number ?? 0,
    scene_title: plan.scene_title ?? base?.scene_title ?? null,
    timestamp_range: plan.timestamp_range ?? base?.timestamp_range ?? null,
    duration: plan.duration ?? base?.duration ?? 4.0,
    motion_effect: plan.motion_effect ?? base?.motion_effect ?? 'Slow Zoom In',
    transition_in: plan.transition_in ?? base?.transition_in ?? 'Fade',
    transition_out: plan.transition_out ?? base?.transition_out ?? 'Fade',
    caption_text: plan.caption_text ?? base?.caption_text ?? null,
    lyric_moment: plan.lyric_moment ?? base?.lyric_moment ?? null,
    include_in_final_video: plan.include_in_final_video ?? base?.include_in_final_video ?? true,
    approved: plan.approved ?? base?.approved ?? false,
    status: plan.status ?? base?.status ?? 'not_generated',
    pending: plan.pending ?? base?.pending ?? false,
    failed: plan.failed ?? base?.failed ?? false,
    rejected: plan.rejected ?? base?.rejected ?? false,
    needs_review: plan.needs_review ?? base?.needs_review ?? false,
    updated_after_approval: plan.updated_after_approval ?? base?.updated_after_approval ?? false,
    last_approved_at: plan.last_approved_at ?? base?.last_approved_at ?? null,
    updated_at: new Date().toISOString(),
  };
}

export default function StoryboardMotionTimeline({ projectId, plans, sceneImages, onPlansUpdate }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Record<string, Partial<SceneMotionPlan>>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [approving, setApproving] = useState<Record<string, boolean>>({});
  const [approveAllBusy, setApproveAllBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [previewPlan, setPreviewPlan] = useState<SceneMotionPlan | null>(null);

  const sorted = [...plans].filter(Boolean).sort((a, b) => a.scene_number - b.scene_number);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const setField = <K extends keyof SceneMotionPlan>(id: string, k: K, v: SceneMotionPlan[K]) =>
    setEditing((prev) => ({ ...prev, [id]: { ...prev[id], [k]: v } }));

  const getField = <K extends keyof SceneMotionPlan>(plan: SceneMotionPlan, k: K): SceneMotionPlan[K] =>
    (editing[plan.id]?.[k] as SceneMotionPlan[K]) ?? plan[k];

  const clearError = (id: string) =>
    setErrors((prev) => { const n = { ...prev }; delete n[id]; return n; });

  // Upsert a plan: update if exists, create if not found
  const upsertPlan = async (
    plan: SceneMotionPlan,
    patch: Partial<SceneMotionPlan>,
  ): Promise<SceneMotionPlan> => {
    const payload = buildPlanPayload(projectId, { ...plan, ...patch }, plan);

    // Try update first
    const { data: updated, error: updateErr } = await supabase
      .from('scene_motion_plans')
      .update(payload)
      .eq('id', plan.id)
      .select()
      .maybeSingle();
    if (updateErr) throw new Error(`DB update error: ${updateErr.message}`);

    if (updated) return updated as SceneMotionPlan;

    // Row not found — create it fresh (plan was deleted when settings were re-saved)
    const { data: created, error: insertErr } = await supabase
      .from('scene_motion_plans')
      .insert(payload)
      .select()
      .maybeSingle();
    if (insertErr) throw new Error(`DB insert error: ${insertErr.message}`);
    if (!created) throw new Error(`Motion plan record could not be created for Scene ${plan.scene_number}.`);
    return created as SceneMotionPlan;
  };

  const handleSave = async (plan: SceneMotionPlan) => {
    const patch = editing[plan.id];
    if (!patch || Object.keys(patch).length === 0) return;
    setSaving((p) => ({ ...p, [plan.id]: true }));
    clearError(plan.id);
    try {
      const result = await upsertPlan(plan, patch);
      onPlansUpdate(plans.map((p) => (p.id === plan.id ? result : p)));
      setEditing((prev) => { const n = { ...prev }; delete n[plan.id]; return n; });
      toast.success('Motion plan saved.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setErrors((prev) => ({ ...prev, [plan.id]: msg }));
      toast.error(`Scene ${plan.scene_number}: ${msg}`);
    } finally {
      setSaving((p) => ({ ...p, [plan.id]: false }));
    }
  };

  const handleApprove = async (plan: SceneMotionPlan) => {
    setApproving((p) => ({ ...p, [plan.id]: true }));
    clearError(plan.id);
    try {
      const editPatch = editing[plan.id] ?? {};
      const approvePatch: Partial<SceneMotionPlan> = {
        ...editPatch,
        approved: true,
        pending: false,
        needs_review: false,
        updated_after_approval: false,
        failed: false,
        rejected: false,
        last_approved_at: new Date().toISOString(),
        status: 'ready_for_review' as const,
      };
      const result = await upsertPlan(plan, approvePatch);
      onPlansUpdate(plans.map((p) => (p.id === plan.id ? result : p)));
      setEditing((prev) => { const n = { ...prev }; delete n[plan.id]; return n; });
      toast.success(`Scene ${plan.scene_number} motion plan approved.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setErrors((prev) => ({ ...prev, [plan.id]: msg }));
      toast.error(`Scene ${plan.scene_number} approve failed: ${msg}`);
    } finally {
      setApproving((p) => ({ ...p, [plan.id]: false }));
    }
  };

  const handleRegenerate = async (plan: SceneMotionPlan) => {
    setSaving((p) => ({ ...p, [plan.id]: true }));
    clearError(plan.id);
    try {
      const effects = MOTION_EFFECTS as unknown as string[];
      const nextEffect = effects[(effects.indexOf(plan.motion_effect) + 1) % effects.length];
      const result = await upsertPlan(plan, {
        motion_effect: nextEffect,
        approved: false,
        pending: false,
        failed: false,
        rejected: false,
        status: 'not_generated' as const,
      });
      onPlansUpdate(plans.map((p) => (p.id === plan.id ? result : p)));
      toast.success(`Scene ${plan.scene_number} motion plan regenerated.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setErrors((prev) => ({ ...prev, [plan.id]: msg }));
      toast.error(`Scene ${plan.scene_number}: ${msg}`);
    } finally {
      setSaving((p) => ({ ...p, [plan.id]: false }));
    }
  };

  const handleApproveAll = async () => {
    const toApprove = sorted.filter((p) => !p.approved);
    if (toApprove.length === 0) { toast.success('All plans already approved.'); return; }
    setApproveAllBusy(true);
    let approved = 0;
    const updated = [...plans];
    for (const plan of toApprove) {
      try {
        const result = await upsertPlan(plan, {
          approved: true,
          pending: false,
          needs_review: false,
          updated_after_approval: false,
          failed: false,
          rejected: false,
          last_approved_at: new Date().toISOString(),
          status: 'ready_for_review' as const,
        });
        const idx = updated.findIndex((p) => p.id === plan.id);
        if (idx !== -1) updated[idx] = result;
        approved++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setErrors((prev) => ({ ...prev, [plan.id]: msg }));
      }
    }
    onPlansUpdate(updated);
    setApproveAllBusy(false);
    if (approved === toApprove.length) {
      toast.success('All motion plans approved.');
    } else {
      toast.warning(`${approved}/${toApprove.length} plans approved. Check individual scenes for errors.`);
    }
  };

  if (plans.length === 0) {
    return (
      <div
        className="rounded-2xl p-8 text-center"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <p className="text-sm text-muted-foreground/50">
          No motion plans yet. Save Motion Style Settings to generate the timeline.
        </p>
      </div>
    );
  }

  const approvedCount = sorted.filter((p) => p.approved).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs font-mono text-muted-foreground/50 uppercase tracking-widest">
          Storyboard Motion Timeline · {plans.length} scenes · {approvedCount}/{plans.length} approved
        </p>
        {approvedCount < sorted.length && (
          <Button
            size="sm"
            onClick={handleApproveAll}
            disabled={approveAllBusy}
            className="h-8 text-xs font-semibold"
            style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.30)', color: '#6ee7b7' }}
          >
            {approveAllBusy ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1.5" />}
            Approve All Plans
          </Button>
        )}
      </div>

      {sorted.map((plan) => {
        const img = sceneImages.find(
          (i) => (i.storyboard_scene_id === plan.storyboard_scene_id || i.scene_number === plan.scene_number) && i.approved
        );
        const isExpanded = expanded[plan.id];
        const isDirty = !!editing[plan.id] && Object.keys(editing[plan.id]).length > 0;
        const isSaving = saving[plan.id];
        const isApproving = approving[plan.id];
        const planError = errors[plan.id];

        return (
          <div
            key={plan.id}
            className="rounded-2xl overflow-hidden"
            style={{
              background: plan.approved
                ? 'rgba(16,185,129,0.04)'
                : 'rgba(255,255,255,0.025)',
              border: plan.approved
                ? '1px solid rgba(16,185,129,0.20)'
                : planError
                  ? '1px solid rgba(239,68,68,0.35)'
                  : '1px solid rgba(255,255,255,0.07)',
            }}
          >
            {/* Scene row header */}
            <div className="flex items-center gap-3 p-4">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-mono text-xs font-bold"
                style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.30)', color: '#c4b5fd' }}
              >
                {String(plan.scene_number).padStart(2, '0')}
              </div>

              {img?.image_url && (
                <div className="w-12 h-8 rounded-lg overflow-hidden shrink-0" style={{ border: '1px solid rgba(255,255,255,0.10)' }}>
                  <img src={img.image_url} alt="" className="w-full h-full object-cover" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground/90 truncate">
                  {plan.scene_title ?? `Scene ${plan.scene_number}`}
                </p>
                <div className="flex flex-wrap gap-2 mt-0.5">
                  {plan.timestamp_range && (
                    <span className="text-[10px] font-mono text-muted-foreground/50">{plan.timestamp_range}</span>
                  )}
                  <span className="text-[10px] font-mono text-blue-400/70">{getField(plan, 'motion_effect')}</span>
                  <span className="text-[10px] font-mono text-violet-400/70">{getField(plan, 'transition_in')}</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {plan.approved
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  : planError
                    ? <AlertCircle className="w-4 h-4 text-red-400" />
                    : null}
                <button
                  onClick={() => setPreviewPlan(plan)}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                  style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.28)', color: '#a5b4fc' }}
                  title="Preview Motion"
                >
                  <Eye className="w-3 h-3" /> Preview
                </button>
                <button
                  onClick={() => toggleExpand(plan.id)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Error banner */}
            {planError && (
              <div
                className="mx-4 mb-3 rounded-xl px-3 py-2 text-xs text-red-300 flex items-start gap-2"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-400" />
                <span className="flex-1 min-w-0 break-words">{planError}</span>
                <button
                  onClick={() => clearError(plan.id)}
                  className="shrink-0 text-red-400/60 hover:text-red-400 text-[10px]"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Expanded content */}
            {isExpanded && (
              <div className="px-4 pb-4 space-y-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <div className="pt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-mono text-muted-foreground/50 uppercase">Duration (s)</Label>
                    <Input
                      type="number" step="0.5" min="1" max="30"
                      value={String(getField(plan, 'duration') ?? 4)}
                      onChange={(e) => setField(plan.id, 'duration', parseFloat(e.target.value))}
                      className="h-9 text-sm"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-mono text-muted-foreground/50 uppercase">Motion Effect</Label>
                    <Select value={String(getField(plan, 'motion_effect'))} onValueChange={(v) => setField(plan.id, 'motion_effect', v)}>
                      <SelectTrigger className="h-9 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(MOTION_EFFECTS as unknown as string[]).map((e) => (
                          <SelectItem key={e} value={e}>{e}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-mono text-muted-foreground/50 uppercase">Transition In</Label>
                    <Select value={String(getField(plan, 'transition_in'))} onValueChange={(v) => setField(plan.id, 'transition_in', v)}>
                      <SelectTrigger className="h-9 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(TRANSITION_STYLES as unknown as string[]).map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-mono text-muted-foreground/50 uppercase">Transition Out</Label>
                    <Select value={String(getField(plan, 'transition_out'))} onValueChange={(v) => setField(plan.id, 'transition_out', v)}>
                      <SelectTrigger className="h-9 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(TRANSITION_STYLES as unknown as string[]).map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-mono text-muted-foreground/50 uppercase">Caption Text</Label>
                  <Textarea
                    rows={2}
                    placeholder="Leave empty for no caption on this scene"
                    value={String(getField(plan, 'caption_text') ?? '')}
                    onChange={(e) => setField(plan.id, 'caption_text', e.target.value || null)}
                    className="text-sm resize-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}
                  />
                </div>

                {plan.lyric_moment && (
                  <div
                    className="rounded-lg px-3 py-2 text-xs text-muted-foreground/60 italic"
                    style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}
                  >
                    🎵 &ldquo;{plan.lyric_moment}&rdquo;
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <Label className="text-sm text-foreground/70">Include in final video</Label>
                  <Switch
                    checked={getField(plan, 'include_in_final_video') as boolean}
                    onCheckedChange={(v) => setField(plan.id, 'include_in_final_video', v)}
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {isDirty && (
                    <Button
                      size="sm"
                      onClick={() => handleSave(plan)}
                      disabled={isSaving}
                      className="h-8 text-xs font-semibold"
                      style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', color: '#6ee7b7' }}
                    >
                      {isSaving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Edit3 className="w-3 h-3 mr-1" />}
                      Save Changes
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRegenerate(plan)}
                    disabled={isSaving || isApproving}
                    className="h-8 text-xs"
                    style={{ border: '1px solid rgba(255,255,255,0.10)', color: 'rgb(163,163,163)' }}
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Regenerate Plan
                  </Button>
                  {!plan.approved ? (
                    <Button
                      size="sm"
                      onClick={() => handleApprove(plan)}
                      disabled={isApproving || isSaving}
                      className="h-8 text-xs font-semibold ml-auto"
                      style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', color: '#6ee7b7' }}
                    >
                      {isApproving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                      Approve Plan
                    </Button>
                  ) : (
                    <span className="ml-auto flex items-center gap-1 text-xs text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" /> Approved
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Motion Preview Modal */}
      {previewPlan && (
        <MotionPreviewModal
          plan={previewPlan}
          image={sceneImages.find(
            (i) => (i.storyboard_scene_id === previewPlan.storyboard_scene_id || i.scene_number === previewPlan.scene_number) && i.approved
          )}
          onClose={() => setPreviewPlan(null)}
        />
      )}
    </div>
  );
}
