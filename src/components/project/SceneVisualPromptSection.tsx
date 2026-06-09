import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/db/supabase';
import type { SceneVisualPrompt, Project } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckCircle2, RefreshCw, Edit3, Loader2, Film,
  Camera, Lightbulb, User, Palette, Globe, Gem, ShieldCheck, AlertTriangle, Clock, Save, X
} from 'lucide-react';
import { toast } from 'sonner';
import AfterEditChoiceDialog from '@/components/project/AfterEditChoiceDialog';
import {
  DOWNSTREAM_DEPS,
  createChangeLogEntry,
  reapproveSection,
} from '@/hooks/useReviewChanges';
import { ReviewStatusBadge } from '@/components/project/ReviewChangesPanel';
import type { ReviewSectionStatus } from '@/components/project/ReviewChangesPanel';

interface Props {
  prompts: SceneVisualPrompt[];
  project: Project;
  generatingAll: boolean;
  refreshingId: string | null;
  onRefreshPrompt: (prompt: SceneVisualPrompt) => void;
  onAllApproved: () => void;
  onPromptUpdate: (p: SceneVisualPrompt) => void;
  onChangeLogged?: () => void;
}

const PROMPT_FIELDS: { key: keyof SceneVisualPrompt; label: string; icon: React.ElementType; fullWidth?: boolean }[] = [
  { key: 'main_image_prompt', label: 'Main Image Prompt', icon: Film, fullWidth: true },
  { key: 'camera_framing', label: 'Camera Framing', icon: Camera },
  { key: 'lighting_direction', label: 'Lighting Direction', icon: Lightbulb },
  { key: 'character_placement', label: 'Character Placement', icon: User },
  { key: 'mood', label: 'Mood', icon: Palette },
  { key: 'environment_details', label: 'Environment', icon: Globe },
  { key: 'symbolic_objects', label: 'Symbolic Objects', icon: Gem },
  { key: 'style_consistency_notes', label: 'Style Consistency Notes', icon: ShieldCheck },
  { key: 'negative_prompt', label: 'Negative Prompt', icon: AlertTriangle, fullWidth: true },
];

function ScenePromptCard({
  prompt,
  project,
  refreshingId,
  onRefresh,
  onUpdate,
  onChangeLogged,
}: {
  prompt: SceneVisualPrompt;
  project: Project;
  refreshingId: string | null;
  onRefresh: (p: SceneVisualPrompt) => void;
  onUpdate: (p: SceneVisualPrompt) => void;
  onChangeLogged?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<SceneVisualPrompt>>({});
  const [approving, setApproving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showChoiceDialog, setShowChoiceDialog] = useState(false);
  const [pendingSaveData, setPendingSaveData] = useState<Partial<SceneVisualPrompt> | null>(null);
  const isRefreshing = refreshingId === prompt.id;

  const handleEdit = () => {
    setEditData({ ...prompt });
    setEditing(true);
  };

  const handleSave = async () => {
    if (prompt.approved) {
      setPendingSaveData(editData);
      setShowChoiceDialog(true);
      return;
    }
    await performSave(editData, false);
  };

  const performSave = async (data: Partial<SceneVisualPrompt>, updatedAfterApproval: boolean) => {
    setSaving(true);
    try {
      const updates: Partial<SceneVisualPrompt> = {};
      PROMPT_FIELDS.forEach(({ key }) => {
        if (data[key] !== undefined) (updates as Record<string, unknown>)[key] = data[key];
      });
      (updates as Record<string, unknown>).updated_after_approval = updatedAfterApproval;
      updates.updated_at = new Date().toISOString();
      const { data: saved, error } = await supabase
        .from('scene_visual_prompts')
        .update(updates)
        .eq('id', prompt.id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (saved) onUpdate(saved as SceneVisualPrompt);
      setEditing(false);
      toast.success(`Scene ${prompt.scene_number} prompt updated.`);
    } catch {
      toast.error('Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      const now = new Date().toISOString();
      const { data: saved, error } = await supabase
        .from('scene_visual_prompts')
        .update({ approved: true, needs_review: false, updated_after_approval: false, last_approved_at: now, updated_at: now })
        .eq('id', prompt.id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (saved) onUpdate(saved as SceneVisualPrompt);
      toast.success(`Scene ${prompt.scene_number} prompt approved.`);
    } catch {
      toast.error('Failed to approve prompt.');
    } finally {
      setApproving(false);
    }
  };

  const handleMarkDownstream = async () => {
    setShowChoiceDialog(false);
    if (!pendingSaveData) return;
    await performSave(pendingSaveData, true);
    // Mark the specific scene image as needs_review
    await supabase.from('scene_images')
      .update({ needs_review: true, updated_at: new Date().toISOString() })
      .eq('project_id', project.id)
      .eq('scene_number', prompt.scene_number);
    await createChangeLogEntry({
      projectId: project.id,
      sectionName: `Scene ${prompt.scene_number} Prompt`,
      sectionType: 'scene_visual_prompt',
      sectionRecordId: prompt.id,
      changeType: 'marked_downstream_needs_review',
      changeSummary: `Scene ${prompt.scene_number} prompt edited after approval. Scene image marked for review.`,
      affectedSections: DOWNSTREAM_DEPS['scene_visual_prompt'],
      userChoice: 'Mark affected sections as Needs Review',
    });
    onChangeLogged?.();
    toast.success(`Scene ${prompt.scene_number} updated. Scene image marked for review.`);
    setPendingSaveData(null);
  };

  const handleKeepUnchanged = async () => {
    setShowChoiceDialog(false);
    if (!pendingSaveData) return;
    await performSave(pendingSaveData, true);
    await createChangeLogEntry({
      projectId: project.id,
      sectionName: `Scene ${prompt.scene_number} Prompt`,
      sectionType: 'scene_visual_prompt',
      sectionRecordId: prompt.id,
      changeType: 'kept_later_sections_unchanged',
      changeSummary: `Scene ${prompt.scene_number} prompt edited after approval. Creator chose to keep scene image unchanged.`,
      affectedSections: DOWNSTREAM_DEPS['scene_visual_prompt'],
      userChoice: 'Keep later sections unchanged',
    });
    onChangeLogged?.();
    toast.success(`Scene ${prompt.scene_number} updated. Scene image kept unchanged.`);
    setPendingSaveData(null);
  };

  const handleReapprove = async () => {
    setApproving(true);
    try {
      await reapproveSection('scene_visual_prompts', prompt.id);
      const now = new Date().toISOString();
      onUpdate({ ...prompt, needs_review: false, updated_after_approval: false, last_approved_at: now });
      await createChangeLogEntry({
        projectId: project.id,
        sectionName: `Scene ${prompt.scene_number} Prompt`,
        sectionType: 'scene_visual_prompt',
        sectionRecordId: prompt.id,
        changeType: 'reapproved',
        changeSummary: `Scene ${prompt.scene_number} prompt reapproved.`,
        affectedSections: [],
      });
      onChangeLogged?.();
      toast.success(`Scene ${prompt.scene_number} prompt reapproved.`);
    } catch {
      toast.error('Failed to reapprove prompt.');
    } finally {
      setApproving(false);
    }
  };

  const reviewStatus: ReviewSectionStatus | null = prompt.needs_review
    ? 'Needs Review'
    : prompt.updated_after_approval
    ? 'Updated After Approval'
    : prompt.approved
    ? 'Approved'
    : null;

  return (
    <>
      <AfterEditChoiceDialog
        open={showChoiceDialog}
        sectionType="scene_visual_prompt"
        sectionName={`Scene ${prompt.scene_number} Prompt`}
        onMarkDownstream={handleMarkDownstream}
        onKeepUnchanged={handleKeepUnchanged}
        onClose={() => { setShowChoiceDialog(false); setPendingSaveData(null); }}
      />
      <Card
        className="border-white/10 overflow-hidden"
        style={{
          background: prompt.approved && !prompt.needs_review && !prompt.updated_after_approval
            ? 'rgba(16,185,129,0.05)'
            : 'rgba(255,255,255,0.03)',
          borderColor: prompt.needs_review
            ? 'rgba(249,115,22,0.25)'
            : prompt.updated_after_approval
            ? 'rgba(229,169,60,0.25)'
            : prompt.approved
            ? 'rgba(16,185,129,0.2)'
            : undefined,
        }}
      >
        {/* Scene header */}
        <CardHeader className="pb-3 pt-4 px-4 border-b border-white/5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="flex items-center justify-center w-8 h-8 rounded-lg font-bold text-sm shrink-0"
                style={{ background: 'rgba(59,126,255,0.2)', color: '#3b7eff' }}
              >
                {prompt.scene_number}
              </div>
              <div className="min-w-0">
                <CardTitle className="text-sm font-semibold text-white text-balance">
                  {prompt.scene_title || `Scene ${prompt.scene_number}`}
                </CardTitle>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {prompt.timestamp_range && (
                    <>
                      <Clock className="h-3 w-3 text-white/40 shrink-0" />
                      <span className="text-xs text-white/40">{prompt.timestamp_range}</span>
                    </>
                  )}
                  {reviewStatus && <ReviewStatusBadge status={reviewStatus} />}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {/* Persistent edit buttons */}
              {editing ? (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(false)} className="h-7 px-2.5 border border-white/20 text-white/60 hover:bg-white/10 hover:text-white text-xs">
                    <X className="h-3 w-3 mr-1" />Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 px-2.5 text-xs text-white font-medium" style={{ background: 'linear-gradient(135deg,#3b7eff,#8b5cf6)' }}>
                    {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}Save
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={handleEdit} className="h-7 px-2.5 border border-white/20 text-white/60 hover:bg-white/10 hover:text-white text-xs">
                    <Edit3 className="h-3 w-3 mr-1" />Edit
                  </Button>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => onRefresh(prompt)}
                    disabled={isRefreshing}
                    className="h-7 px-2.5 border border-white/20 text-white/60 hover:bg-white/10 hover:text-white text-xs"
                  >
                    {isRefreshing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                    Regenerate
                  </Button>
                  {!prompt.approved ? (
                    <Button size="sm" onClick={handleApprove} disabled={approving} className="h-7 px-2.5 text-xs text-white font-medium" style={{ background: 'linear-gradient(135deg,#3b7eff,#8b5cf6)' }}>
                      {approving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}Approve
                    </Button>
                  ) : (prompt.needs_review || prompt.updated_after_approval) ? (
                    <Button size="sm" onClick={handleReapprove} disabled={approving} className="h-7 px-2.5 text-xs text-white font-medium" style={{ background: 'linear-gradient(135deg,#10b981,#3b7eff)' }}>
                      {approving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}Reapprove
                    </Button>
                  ) : (
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />Approved
                    </Badge>
                  )}
                </>
              )}
            </div>
          </div>
          {/* Inline status banners */}
          {prompt.needs_review && (
            <div className="mt-2 flex items-start gap-1.5 rounded-lg px-3 py-2 border" style={{ background: 'rgba(249,115,22,0.06)', borderColor: 'rgba(249,115,22,0.2)' }}>
              <AlertTriangle className="w-3 h-3 text-orange-400 shrink-0 mt-0.5" />
              <p className="text-xs text-orange-300/80 text-pretty">This scene prompt needs review due to upstream changes.</p>
            </div>
          )}
          {prompt.updated_after_approval && !prompt.needs_review && (
            <div className="mt-2 flex items-start gap-1.5 rounded-lg px-3 py-2 border" style={{ background: 'rgba(229,169,60,0.05)', borderColor: 'rgba(229,169,60,0.18)' }}>
              <Clock className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300/70 text-pretty">This prompt was edited after approval. Scene image kept unchanged by creator choice.</p>
            </div>
          )}
        </CardHeader>

        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {PROMPT_FIELDS.map(({ key, label, icon: Icon, fullWidth }) => {
              const value = prompt[key];
              return (
                <div key={key} className={fullWidth ? 'md:col-span-2' : ''}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Icon
                      className="h-3 w-3 shrink-0"
                      style={{ color: key === 'negative_prompt' ? '#f87171' : key === 'main_image_prompt' ? '#3b7eff' : '#8b5cf6' }}
                    />
                    <span
                      className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: key === 'negative_prompt' ? '#f87171' : key === 'main_image_prompt' ? '#3b7eff' : '#8b5cf6' }}
                    >
                      {label}
                    </span>
                  </div>
                  {editing ? (
                    <Textarea
                      value={(editData[key] as string) ?? ''}
                      onChange={(e) => setEditData((p) => ({ ...p, [key]: e.target.value }))}
                      className="min-h-[72px] text-xs text-white/90 bg-white/5 border-white/20 resize-none"
                    />
                  ) : (
                    <p className="text-xs text-white/75 leading-relaxed text-pretty">
                      {(value as string) || <span className="text-white/25 italic">—</span>}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

export default function SceneVisualPromptSection({ prompts, project, generatingAll, refreshingId, onRefreshPrompt, onAllApproved, onPromptUpdate, onChangeLogged }: Props) {
  const approvedCount = prompts.filter((p) => p.approved).length;
  const allApproved = prompts.length > 0 && approvedCount === prompts.length;

  // When every individual prompt is approved (via per-card buttons), automatically
  // set project.scene_prompts_approved and fire onAllApproved — matching what
  // "Approve All" does in bulk.
  const didAutoFireRef = useRef(false);
  useEffect(() => {
    if (!allApproved || project.scene_prompts_approved || didAutoFireRef.current) return;
    didAutoFireRef.current = true;
    const now = new Date().toISOString();
    supabase
      .from('projects')
      .update({ scene_prompts_approved: true, updated_at: now })
      .eq('id', project.id)
      .then(({ error }) => {
        if (!error) {
          onAllApproved();
          toast.success('All scene prompts approved! Scene visual package complete.');
        }
      });
  }, [allApproved, project.scene_prompts_approved, project.id, onAllApproved]);

  // Reset the guard when prompts change (e.g. new generation run)
  useEffect(() => {
    didAutoFireRef.current = false;
  }, [prompts.length]);

  const handleApproveAll = async () => {
    try {
      const unapproved = prompts.filter((p) => !p.approved);
      if (unapproved.length === 0) {
        onAllApproved();
        return;
      }
      const ids = unapproved.map((p) => p.id);
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('scene_visual_prompts')
        .update({ approved: true, needs_review: false, updated_after_approval: false, last_approved_at: now, updated_at: now })
        .in('id', ids);
      if (error) throw error;

      const { error: pErr } = await supabase
        .from('projects')
        .update({ scene_prompts_approved: true, updated_at: now })
        .eq('id', project.id);
      if (pErr) throw pErr;

      unapproved.forEach((p) => onPromptUpdate({ ...p, approved: true, needs_review: false, updated_after_approval: false, last_approved_at: now }));
      didAutoFireRef.current = true; // prevent double-fire from useEffect
      onAllApproved();
      toast.success('All scene prompts approved! Scene visual package complete.');
    } catch {
      toast.error('Failed to approve all prompts.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Film className="h-5 w-5 shrink-0" style={{ color: '#f59e0b' }} />
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-white text-balance">Scene Visual Prompt Pack</h3>
            {prompts.length > 0 && (
              <p className="text-xs text-white/40 mt-0.5">
                {approvedCount} of {prompts.length} scene prompts approved
              </p>
            )}
          </div>
        </div>
        {prompts.length > 0 && !allApproved && (
          <Button
            size="sm"
            onClick={handleApproveAll}
            className="text-white font-semibold shrink-0"
            style={{ background: 'linear-gradient(135deg,#f59e0b,#3b7eff)' }}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            Approve All Prompts
          </Button>
        )}
        {allApproved && (
          <Badge className="bg-green-500/20 text-green-400 border-green-500/30 flex items-center gap-1.5 shrink-0">
            <CheckCircle2 className="h-3 w-3" />All Prompts Approved
          </Badge>
        )}
      </div>

      {generatingAll && prompts.length === 0 && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-5 w-48 bg-white/10" />
                <Skeleton className="h-20 w-full bg-white/10" />
                <div className="grid grid-cols-2 gap-3">
                  <Skeleton className="h-12 bg-white/10" />
                  <Skeleton className="h-12 bg-white/10" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!generatingAll && prompts.length === 0 && (
        <Card className="border-dashed border-white/20" style={{ background: 'rgba(245,158,11,0.05)' }}>
          <CardContent className="p-8 text-center space-y-3">
            <Film className="h-10 w-10 mx-auto opacity-40" style={{ color: '#f59e0b' }} />
            <p className="text-white/60 text-sm text-pretty">
              Generate scene visual prompts to create ready-to-use AI image generation prompts for every scene.
            </p>
          </CardContent>
        </Card>
      )}

      {prompts.length > 0 && (
        <div className="space-y-3">
          {prompts
            .slice()
            .sort((a, b) => a.scene_number - b.scene_number)
            .map((prompt) => (
              <ScenePromptCard
                key={prompt.id}
                prompt={prompt}
                project={project}
                refreshingId={refreshingId}
                onRefresh={onRefreshPrompt}
                onUpdate={onPromptUpdate}
                onChangeLogged={onChangeLogged}
              />
            ))}
        </div>
      )}
    </div>
  );
}
