import { useState } from 'react';
import { supabase } from '@/db/supabase';
import type { WorldStyleBible, Project } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckCircle2, RefreshCw, Edit3, Loader2, BookOpen,
  Palette, Lightbulb, Camera, Users, Globe, Gem, AlertTriangle, Save, X, Clock
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
  bible: WorldStyleBible | null;
  project: Project;
  generating: boolean;
  onGenerate: () => void;
  onApproved: (b: WorldStyleBible) => void;
  onBibleUpdate: (b: WorldStyleBible) => void;
  onChangeLogged?: () => void;
}

const FIELDS: { key: keyof WorldStyleBible; label: string; icon: React.ElementType }[] = [
  { key: 'overall_visual_style', label: 'Overall Visual Style', icon: BookOpen },
  { key: 'color_rules', label: 'Color Rules', icon: Palette },
  { key: 'lighting_rules', label: 'Lighting Rules', icon: Lightbulb },
  { key: 'camera_rules', label: 'Camera Rules', icon: Camera },
  { key: 'character_consistency_rules', label: 'Character Consistency Rules', icon: Users },
  { key: 'environment_rules', label: 'Environment Rules', icon: Globe },
  { key: 'symbolic_motifs', label: 'Symbolic Motifs', icon: Gem },
  { key: 'things_to_avoid', label: 'Things to Avoid', icon: AlertTriangle },
];

export default function WorldStyleBibleSection({ bible, project, generating, onGenerate, onApproved, onBibleUpdate, onChangeLogged }: Props) {
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<WorldStyleBible>>({});
  const [approving, setApproving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showChoiceDialog, setShowChoiceDialog] = useState(false);
  const [pendingSaveData, setPendingSaveData] = useState<Partial<WorldStyleBible> | null>(null);

  const handleEdit = () => {
    if (!bible) return;
    setEditData({ ...bible });
    setEditing(true);
  };

  const handleSave = async () => {
    if (!bible) return;
    if (bible.approved) {
      setPendingSaveData(editData);
      setShowChoiceDialog(true);
      return;
    }
    await performSave(editData, false);
  };

  const performSave = async (data: Partial<WorldStyleBible>, updatedAfterApproval: boolean) => {
    if (!bible) return;
    setSaving(true);
    try {
      const updates: Partial<WorldStyleBible> = {};
      FIELDS.forEach(({ key }) => {
        if (data[key] !== undefined) (updates as Record<string, unknown>)[key] = data[key];
      });
      (updates as Record<string, unknown>).updated_after_approval = updatedAfterApproval;
      updates.updated_at = new Date().toISOString();
      const { data: saved, error } = await supabase
        .from('world_style_bibles')
        .update(updates)
        .eq('id', bible.id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (saved) onBibleUpdate(saved as WorldStyleBible);
      setEditing(false);
      toast.success('Style Bible updated.');
    } catch {
      toast.error('Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!bible) return;
    setApproving(true);
    try {
      const now = new Date().toISOString();
      const { error: bErr } = await supabase
        .from('world_style_bibles')
        .update({ approved: true, needs_review: false, updated_after_approval: false, last_approved_at: now, updated_at: now })
        .eq('id', bible.id);
      if (bErr) throw bErr;

      const { error: pErr } = await supabase
        .from('projects')
        .update({ style_bible_approved: true, updated_at: now })
        .eq('id', project.id);
      if (pErr) throw pErr;

      const updated = { ...bible, approved: true, needs_review: false, updated_after_approval: false, last_approved_at: now };
      onBibleUpdate(updated as WorldStyleBible);
      onApproved(updated as WorldStyleBible);
      toast.success('Style Bible approved! Visual rules locked in.');
    } catch {
      toast.error('Failed to approve Style Bible.');
    } finally {
      setApproving(false);
    }
  };

  const handleMarkDownstream = async () => {
    setShowChoiceDialog(false);
    if (!bible || !pendingSaveData) return;
    await performSave(pendingSaveData, true);
    await supabase.from('scene_images').update({ needs_review: true, updated_at: new Date().toISOString() }).eq('project_id', project.id);
    await createChangeLogEntry({
      projectId: project.id,
      sectionName: 'World Style Bible',
      sectionType: 'world_style_bible',
      sectionRecordId: bible.id,
      changeType: 'marked_downstream_needs_review',
      changeSummary: 'World Style Bible edited after approval. Scene Images marked for review.',
      affectedSections: DOWNSTREAM_DEPS['world_style_bible'],
      userChoice: 'Mark affected sections as Needs Review',
    });
    onChangeLogged?.();
    toast.success('Style Bible updated. Scene Images marked for review.');
    setPendingSaveData(null);
  };

  const handleKeepUnchanged = async () => {
    setShowChoiceDialog(false);
    if (!bible || !pendingSaveData) return;
    await performSave(pendingSaveData, true);
    await createChangeLogEntry({
      projectId: project.id,
      sectionName: 'World Style Bible',
      sectionType: 'world_style_bible',
      sectionRecordId: bible.id,
      changeType: 'kept_later_sections_unchanged',
      changeSummary: 'World Style Bible edited after approval. Creator chose to keep later sections unchanged.',
      affectedSections: DOWNSTREAM_DEPS['world_style_bible'],
      userChoice: 'Keep later sections unchanged',
    });
    onChangeLogged?.();
    toast.success('Style Bible updated. Later sections kept unchanged.');
    setPendingSaveData(null);
  };

  const handleReapprove = async () => {
    if (!bible) return;
    setApproving(true);
    try {
      await reapproveSection('world_style_bibles', bible.id);
      const now = new Date().toISOString();
      onBibleUpdate({ ...bible, needs_review: false, updated_after_approval: false, last_approved_at: now });
      await createChangeLogEntry({
        projectId: project.id,
        sectionName: 'World Style Bible',
        sectionType: 'world_style_bible',
        sectionRecordId: bible.id,
        changeType: 'reapproved',
        changeSummary: 'World Style Bible reapproved after changes.',
        affectedSections: [],
      });
      onChangeLogged?.();
      toast.success('World Style Bible reapproved.');
    } catch {
      toast.error('Failed to reapprove.');
    } finally {
      setApproving(false);
    }
  };

  const reviewStatus: ReviewSectionStatus | null = bible
    ? bible.needs_review
      ? 'Needs Review'
      : bible.updated_after_approval
      ? 'Updated After Approval'
      : bible.approved
      ? 'Approved'
      : null
    : null;

  return (
    <div className="space-y-4">
      <AfterEditChoiceDialog
        open={showChoiceDialog}
        sectionType="world_style_bible"
        sectionName="World Style Bible"
        onMarkDownstream={handleMarkDownstream}
        onKeepUnchanged={handleKeepUnchanged}
        onClose={() => { setShowChoiceDialog(false); setPendingSaveData(null); }}
      />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <BookOpen className="h-5 w-5 shrink-0" style={{ color: '#3b7eff' }} />
          <h3 className="text-lg font-semibold text-white text-balance">World Style Bible</h3>
          {reviewStatus && <ReviewStatusBadge status={reviewStatus} />}
          {bible?.approved && !bible.needs_review && !bible.updated_after_approval && (
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 shrink-0">Approved</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {bible && (
            <>
              {!editing ? (
                <Button variant="ghost" size="sm" onClick={handleEdit} className="border border-white/20 text-white/70 hover:bg-white/10 hover:text-white">
                  <Edit3 className="h-3.5 w-3.5 mr-1.5" />Edit
                </Button>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(false)} className="border border-white/20 text-white/70 hover:bg-white/10 hover:text-white">
                    <X className="h-3.5 w-3.5 mr-1.5" />Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving} className="text-white font-semibold" style={{ background: 'linear-gradient(135deg,#3b7eff,#8b5cf6)' }}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}Save
                  </Button>
                </>
              )}
              <Button variant="ghost" size="sm" onClick={onGenerate} disabled={generating} className="border border-white/20 text-white/70 hover:bg-white/10 hover:text-white">
                {generating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}Regenerate
              </Button>
              {!bible.approved ? (
                <Button size="sm" onClick={handleApprove} disabled={approving} className="text-white font-semibold" style={{ background: 'linear-gradient(135deg,#3b7eff,#8b5cf6)' }}>
                  {approving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}Approve Style Bible
                </Button>
              ) : (bible.needs_review || bible.updated_after_approval) ? (
                <Button size="sm" onClick={handleReapprove} disabled={approving} className="text-white font-semibold" style={{ background: 'linear-gradient(135deg,#10b981,#3b7eff)' }}>
                  {approving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}Reapprove
                </Button>
              ) : (
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3" />Rules Locked
                </Badge>
              )}
            </>
          )}
        </div>
      </div>

      {bible?.needs_review && (
        <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 border" style={{ background: 'rgba(249,115,22,0.07)', borderColor: 'rgba(249,115,22,0.25)' }}>
          <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
          <p className="text-xs text-orange-300/80 text-pretty leading-relaxed">This section needs review due to upstream changes.</p>
        </div>
      )}
      {bible?.updated_after_approval && !bible.needs_review && (
        <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 border" style={{ background: 'rgba(229,169,60,0.06)', borderColor: 'rgba(229,169,60,0.2)' }}>
          <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300/80 text-pretty leading-relaxed">This section was edited after approval. Later sections were kept unchanged by creator choice.</p>
        </div>
      )}

      {generating && !bible && (
        <div className="space-y-3">
          {FIELDS.map(({ key }) => (
            <Card key={key} className="border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-4 w-32 bg-white/10" />
                <Skeleton className="h-12 w-full bg-white/10" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!generating && !bible && (
        <Card className="border-dashed border-white/20" style={{ background: 'rgba(59,126,255,0.05)' }}>
          <CardContent className="p-8 text-center space-y-3">
            <BookOpen className="h-10 w-10 mx-auto opacity-40" style={{ color: '#3b7eff' }} />
            <p className="text-white/60 text-sm text-pretty">
              Generate your World Style Bible to lock in the visual rules for every scene.
            </p>
          </CardContent>
        </Card>
      )}

      {bible && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {FIELDS.map(({ key, label, icon: Icon }) => {
            const value = bible[key];
            if (key === 'approved' || key === 'id' || key === 'project_id' || key === 'created_at' || key === 'updated_at') return null;
            return (
              <Card
                key={key}
                className="border-white/10 h-full"
                style={{
                  background: key === 'things_to_avoid' ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.03)',
                  borderColor: key === 'things_to_avoid' ? 'rgba(239,68,68,0.2)' : undefined,
                }}
              >
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2" style={{ color: key === 'things_to_avoid' ? '#f87171' : '#3b7eff' }}>
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {editing ? (
                    <Textarea
                      value={(editData[key] as string) ?? ''}
                      onChange={(e) => setEditData((p) => ({ ...p, [key]: e.target.value }))}
                      className="min-h-[80px] text-sm text-white/90 bg-white/5 border-white/20 resize-none"
                    />
                  ) : (
                    <p className="text-sm text-white/80 leading-relaxed text-pretty">
                      {(value as string) || <span className="text-white/30 italic">Not generated yet</span>}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
