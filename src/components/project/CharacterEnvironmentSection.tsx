import { useState } from 'react';
import { supabase } from '@/db/supabase';
import type { CharacterEnvironment, Project } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckCircle2, RefreshCw, Edit3, Loader2, Users, Save, X,
  Globe, Wind, Shirt, ScrollText, AlertTriangle, Clock
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
  charEnv: CharacterEnvironment | null;
  project: Project;
  generating: boolean;
  onRegenerate: () => void;
  onApproved: () => void;
  onCharEnvUpdate: (c: CharacterEnvironment) => void;
  onChangeLogged?: () => void;
}

const FIELDS: { key: keyof CharacterEnvironment; label: string; icon: React.ElementType }[] = [
  { key: 'main_character', label: 'Main Character', icon: Users },
  { key: 'supporting_character', label: 'Supporting Character', icon: Users },
  { key: 'main_environment', label: 'Main Environment', icon: Globe },
  { key: 'visual_atmosphere', label: 'Visual Atmosphere', icon: Wind },
  { key: 'wardrobe_style', label: 'Wardrobe & Style', icon: Shirt },
  { key: 'world_rules', label: 'World Rules', icon: ScrollText },
];

export default function CharacterEnvironmentSection({ charEnv, project, generating, onRegenerate, onApproved, onCharEnvUpdate, onChangeLogged }: Props) {
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<CharacterEnvironment>>({});
  const [approving, setApproving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showChoiceDialog, setShowChoiceDialog] = useState(false);
  const [pendingSaveData, setPendingSaveData] = useState<Partial<CharacterEnvironment> | null>(null);

  const handleApprove = async () => {
    if (!charEnv) return;
    setApproving(true);
    try {
      const now = new Date().toISOString();
      const { error: cErr } = await supabase
        .from('character_environments')
        .update({ approved: true, needs_review: false, updated_after_approval: false, last_approved_at: now, updated_at: now })
        .eq('id', charEnv.id);
      if (cErr) throw cErr;

      const { error: pErr } = await supabase
        .from('projects')
        .update({ characters_approved: true, status: 'Ready for Generation', updated_at: now })
        .eq('id', project.id);
      if (pErr) throw pErr;

      onCharEnvUpdate({ ...charEnv, approved: true, needs_review: false, updated_after_approval: false, last_approved_at: now });
      onApproved();
      toast.success('Characters and world approved! Your world is ready.');
    } catch {
      toast.error('Failed to approve');
    } finally {
      setApproving(false);
    }
  };

  const handleEdit = () => {
    if (!charEnv) return;
    setEditData({
      main_character: charEnv.main_character || '',
      supporting_character: charEnv.supporting_character || '',
      main_environment: charEnv.main_environment || '',
      visual_atmosphere: charEnv.visual_atmosphere || '',
      wardrobe_style: charEnv.wardrobe_style || '',
      world_rules: charEnv.world_rules || '',
    });
    setEditing(true);
  };

  const handleSave = async () => {
    if (!charEnv) return;
    if (charEnv.approved) {
      setPendingSaveData(editData);
      setShowChoiceDialog(true);
      return;
    }
    await performSave(editData, false);
  };

  const performSave = async (data: Partial<CharacterEnvironment>, updatedAfterApproval: boolean) => {
    if (!charEnv) return;
    setSaving(true);
    try {
      const { data: saved, error } = await supabase
        .from('character_environments')
        .update({ ...data, updated_after_approval: updatedAfterApproval, updated_at: new Date().toISOString() })
        .eq('id', charEnv.id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (saved) onCharEnvUpdate(saved as CharacterEnvironment);
      setEditing(false);
      toast.success('Characters and environment updated.');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkDownstream = async () => {
    setShowChoiceDialog(false);
    if (!charEnv || !pendingSaveData) return;
    await performSave(pendingSaveData, true);
    const now = new Date().toISOString();
    await Promise.all([
      supabase.from('character_sheets').update({ needs_review: true, updated_at: now }).eq('project_id', project.id),
      supabase.from('scene_images').update({ needs_review: true, updated_at: now }).eq('project_id', project.id),
    ]);
    await createChangeLogEntry({
      projectId: project.id,
      sectionName: 'Characters & Environment',
      sectionType: 'character_environment',
      sectionRecordId: charEnv.id,
      changeType: 'marked_downstream_needs_review',
      changeSummary: 'Characters & Environment edited after approval. Character Sheet and Scene Images marked for review.',
      affectedSections: DOWNSTREAM_DEPS['character_environment'],
      userChoice: 'Mark affected sections as Needs Review',
    });
    onChangeLogged?.();
    toast.success('Characters updated. Affected sections marked for review.');
    setPendingSaveData(null);
  };

  const handleKeepUnchanged = async () => {
    setShowChoiceDialog(false);
    if (!charEnv || !pendingSaveData) return;
    await performSave(pendingSaveData, true);
    await createChangeLogEntry({
      projectId: project.id,
      sectionName: 'Characters & Environment',
      sectionType: 'character_environment',
      sectionRecordId: charEnv.id,
      changeType: 'kept_later_sections_unchanged',
      changeSummary: 'Characters & Environment edited after approval. Creator chose to keep later sections unchanged.',
      affectedSections: DOWNSTREAM_DEPS['character_environment'],
      userChoice: 'Keep later sections unchanged',
    });
    onChangeLogged?.();
    toast.success('Characters updated. Later sections kept unchanged.');
    setPendingSaveData(null);
  };

  const handleReapprove = async () => {
    if (!charEnv) return;
    setApproving(true);
    try {
      await reapproveSection('character_environments', charEnv.id);
      const now = new Date().toISOString();
      onCharEnvUpdate({ ...charEnv, needs_review: false, updated_after_approval: false, last_approved_at: now });
      await createChangeLogEntry({
        projectId: project.id,
        sectionName: 'Characters & Environment',
        sectionType: 'character_environment',
        sectionRecordId: charEnv.id,
        changeType: 'reapproved',
        changeSummary: 'Characters & Environment reapproved after changes.',
        affectedSections: [],
      });
      onChangeLogged?.();
      toast.success('Characters & Environment reapproved.');
    } catch {
      toast.error('Failed to reapprove');
    } finally {
      setApproving(false);
    }
  };

  const reviewStatus: ReviewSectionStatus | null = charEnv
    ? charEnv.needs_review
      ? 'Needs Review'
      : charEnv.updated_after_approval
      ? 'Updated After Approval'
      : charEnv.approved
      ? 'Approved'
      : null
    : null;

  return (
    <div className="space-y-5">
      <AfterEditChoiceDialog
        open={showChoiceDialog}
        sectionType="character_environment"
        sectionName="Characters & Environment"
        onMarkDownstream={handleMarkDownstream}
        onKeepUnchanged={handleKeepUnchanged}
        onClose={() => { setShowChoiceDialog(false); setPendingSaveData(null); }}
      />

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
            <Users className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-foreground">Characters & Environment</h2>
            <p className="text-xs text-muted-foreground">Who lives in your world and where</p>
          </div>
          {reviewStatus && <ReviewStatusBadge status={reviewStatus} />}
        </div>
        {charEnv && !generating && (
          <div className="flex gap-2 flex-wrap">
            {/* Persistent edit buttons always visible */}
            {!editing ? (
              <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground border border-border h-8" onClick={handleEdit}>
                <Edit3 className="w-3.5 h-3.5 mr-1.5" /> Edit
              </Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground border border-border h-8" onClick={() => setEditing(false)}>
                  <X className="w-3.5 h-3.5 mr-1" /> Cancel
                </Button>
                <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 h-8" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                  Save
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground border border-border h-8" onClick={onRegenerate}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Regenerate
            </Button>
            {!charEnv.approved ? (
              <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 h-8" onClick={handleApprove} disabled={approving}>
                {approving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                Approve Characters & World
              </Button>
            ) : (charEnv.needs_review || charEnv.updated_after_approval) ? (
              <Button size="sm" className="h-8 text-white font-medium" style={{ background: 'linear-gradient(135deg,#10b981,#3b7eff)' }} onClick={handleReapprove} disabled={approving}>
                {approving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                Reapprove
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {charEnv?.needs_review && (
        <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 border" style={{ background: 'rgba(249,115,22,0.07)', borderColor: 'rgba(249,115,22,0.25)' }}>
          <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
          <p className="text-xs text-orange-300/80 text-pretty leading-relaxed">
            This section needs review. An upstream change may have affected the characters and environment. Review and reapprove to confirm it still matches your vision.
          </p>
        </div>
      )}
      {charEnv?.updated_after_approval && !charEnv.needs_review && (
        <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 border" style={{ background: 'rgba(229,169,60,0.06)', borderColor: 'rgba(229,169,60,0.2)' }}>
          <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300/80 text-pretty leading-relaxed">
            This section was edited after approval. Later sections were kept unchanged by creator choice.
          </p>
        </div>
      )}

      {generating ? (
        <Card className="bg-card border-border">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <p className="text-sm text-foreground font-medium">Building the inhabitants of your world...</p>
            </div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-28 bg-muted" />
                <Skeleton className="h-16 w-full bg-muted" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : charEnv ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FIELDS.map(({ key, label, icon: Icon }) => {
            const value = (charEnv[key] as string) || '';
            return (
              <Card key={key} className={`bg-card border-border h-full ${key === 'world_rules' ? 'md:col-span-2' : ''}`}>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {editing ? (
                    <Textarea
                      value={(editData[key] as string) || ''}
                      onChange={(e) => setEditData((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="bg-secondary border-border text-foreground text-sm min-h-20 resize-y"
                    />
                  ) : (
                    <p className="text-sm text-foreground leading-relaxed text-pretty whitespace-pre-line">{value || '—'}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center">
            <Users className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No character data generated yet.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
