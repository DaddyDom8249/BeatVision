import { useState } from 'react';
import { supabase } from '@/db/supabase';
import type { CharacterSheet, Project } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckCircle2, RefreshCw, Edit3, Loader2, User,
  Eye, Shirt, Hand, SmilePlus, Zap, Star, StickyNote, Save, X, AlertTriangle, Clock
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
  sheet: CharacterSheet | null;
  project: Project;
  generating: boolean;
  onGenerate: () => void;
  onApproved: (s: CharacterSheet) => void;
  onSheetUpdate: (s: CharacterSheet) => void;
  onChangeLogged?: () => void;
}

const FIELDS: { key: keyof CharacterSheet; label: string; icon: React.ElementType }[] = [
  { key: 'character_role', label: 'Character Role', icon: User },
  { key: 'appearance', label: 'Appearance', icon: Eye },
  { key: 'wardrobe', label: 'Wardrobe', icon: Shirt },
  { key: 'body_language', label: 'Body Language', icon: Hand },
  { key: 'facial_expression', label: 'Facial Expression', icon: SmilePlus },
  { key: 'personality_energy', label: 'Personality Energy', icon: Zap },
  { key: 'recurring_visual_traits', label: 'Recurring Visual Traits', icon: Star },
  { key: 'consistency_notes', label: 'Consistency Notes', icon: StickyNote },
];

export default function CharacterSheetSection({ sheet, project, generating, onGenerate, onApproved, onSheetUpdate, onChangeLogged }: Props) {
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<CharacterSheet>>({});
  const [approving, setApproving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showChoiceDialog, setShowChoiceDialog] = useState(false);
  const [pendingSaveData, setPendingSaveData] = useState<Partial<CharacterSheet> | null>(null);

  const handleEdit = () => {
    if (!sheet) return;
    setEditData({ ...sheet });
    setEditing(true);
  };

  const handleSave = async () => {
    if (!sheet) return;
    if (sheet.approved) {
      setPendingSaveData(editData);
      setShowChoiceDialog(true);
      return;
    }
    await performSave(editData, false);
  };

  const performSave = async (data: Partial<CharacterSheet>, updatedAfterApproval: boolean) => {
    if (!sheet) return;
    setSaving(true);
    try {
      const updates: Partial<CharacterSheet> = {};
      FIELDS.forEach(({ key }) => {
        if (data[key] !== undefined) (updates as Record<string, unknown>)[key] = data[key];
      });
      (updates as Record<string, unknown>).updated_after_approval = updatedAfterApproval;
      updates.updated_at = new Date().toISOString();
      const { data: saved, error } = await supabase
        .from('character_sheets')
        .update(updates)
        .eq('id', sheet.id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (saved) onSheetUpdate(saved as CharacterSheet);
      setEditing(false);
      toast.success('Character Sheet updated.');
    } catch {
      toast.error('Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!sheet) return;
    setApproving(true);
    try {
      const now = new Date().toISOString();
      const { error: sErr } = await supabase
        .from('character_sheets')
        .update({ approved: true, needs_review: false, updated_after_approval: false, last_approved_at: now, updated_at: now })
        .eq('id', sheet.id);
      if (sErr) throw sErr;

      const { error: pErr } = await supabase
        .from('projects')
        .update({ character_sheet_approved: true, updated_at: now })
        .eq('id', project.id);
      if (pErr) throw pErr;

      const updated = { ...sheet, approved: true, needs_review: false, updated_after_approval: false, last_approved_at: now };
      onSheetUpdate(updated as CharacterSheet);
      onApproved(updated as CharacterSheet);
      toast.success('Character Sheet approved! Character locked in for visual consistency.');
    } catch {
      toast.error('Failed to approve Character Sheet.');
    } finally {
      setApproving(false);
    }
  };

  const handleMarkDownstream = async () => {
    setShowChoiceDialog(false);
    if (!sheet || !pendingSaveData) return;
    await performSave(pendingSaveData, true);
    await supabase.from('scene_images').update({ needs_review: true, updated_at: new Date().toISOString() }).eq('project_id', project.id);
    await createChangeLogEntry({
      projectId: project.id,
      sectionName: 'Character Sheet',
      sectionType: 'character_sheet',
      sectionRecordId: sheet.id,
      changeType: 'marked_downstream_needs_review',
      changeSummary: 'Character Sheet edited after approval. Scene Images marked for review.',
      affectedSections: DOWNSTREAM_DEPS['character_sheet'],
      userChoice: 'Mark affected sections as Needs Review',
    });
    onChangeLogged?.();
    toast.success('Character Sheet updated. Scene Images marked for review.');
    setPendingSaveData(null);
  };

  const handleKeepUnchanged = async () => {
    setShowChoiceDialog(false);
    if (!sheet || !pendingSaveData) return;
    await performSave(pendingSaveData, true);
    await createChangeLogEntry({
      projectId: project.id,
      sectionName: 'Character Sheet',
      sectionType: 'character_sheet',
      sectionRecordId: sheet.id,
      changeType: 'kept_later_sections_unchanged',
      changeSummary: 'Character Sheet edited after approval. Creator chose to keep later sections unchanged.',
      affectedSections: DOWNSTREAM_DEPS['character_sheet'],
      userChoice: 'Keep later sections unchanged',
    });
    onChangeLogged?.();
    toast.success('Character Sheet updated. Later sections kept unchanged.');
    setPendingSaveData(null);
  };

  const handleReapprove = async () => {
    if (!sheet) return;
    setApproving(true);
    try {
      await reapproveSection('character_sheets', sheet.id);
      const now = new Date().toISOString();
      onSheetUpdate({ ...sheet, needs_review: false, updated_after_approval: false, last_approved_at: now });
      await createChangeLogEntry({
        projectId: project.id,
        sectionName: 'Character Sheet',
        sectionType: 'character_sheet',
        sectionRecordId: sheet.id,
        changeType: 'reapproved',
        changeSummary: 'Character Sheet reapproved after changes.',
        affectedSections: [],
      });
      onChangeLogged?.();
      toast.success('Character Sheet reapproved.');
    } catch {
      toast.error('Failed to reapprove.');
    } finally {
      setApproving(false);
    }
  };

  const reviewStatus: ReviewSectionStatus | null = sheet
    ? sheet.needs_review
      ? 'Needs Review'
      : sheet.updated_after_approval
      ? 'Updated After Approval'
      : sheet.approved
      ? 'Approved'
      : null
    : null;

  return (
    <div className="space-y-4">
      <AfterEditChoiceDialog
        open={showChoiceDialog}
        sectionType="character_sheet"
        sectionName="Character Sheet"
        onMarkDownstream={handleMarkDownstream}
        onKeepUnchanged={handleKeepUnchanged}
        onClose={() => { setShowChoiceDialog(false); setPendingSaveData(null); }}
      />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <User className="h-5 w-5 shrink-0" style={{ color: '#8b5cf6' }} />
          <h3 className="text-lg font-semibold text-white text-balance">Character Sheet</h3>
          {reviewStatus && <ReviewStatusBadge status={reviewStatus} />}
          {sheet?.approved && !sheet.needs_review && !sheet.updated_after_approval && (
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 shrink-0">Approved</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {sheet && (
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
                  <Button size="sm" onClick={handleSave} disabled={saving} className="text-white font-semibold" style={{ background: 'linear-gradient(135deg,#8b5cf6,#3b7eff)' }}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}Save
                  </Button>
                </>
              )}
              <Button variant="ghost" size="sm" onClick={onGenerate} disabled={generating} className="border border-white/20 text-white/70 hover:bg-white/10 hover:text-white">
                {generating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}Regenerate
              </Button>
              {!sheet.approved ? (
                <Button size="sm" onClick={handleApprove} disabled={approving} className="text-white font-semibold" style={{ background: 'linear-gradient(135deg,#8b5cf6,#3b7eff)' }}>
                  {approving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}Approve Character Sheet
                </Button>
              ) : (sheet.needs_review || sheet.updated_after_approval) ? (
                <Button size="sm" onClick={handleReapprove} disabled={approving} className="text-white font-semibold" style={{ background: 'linear-gradient(135deg,#10b981,#3b7eff)' }}>
                  {approving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}Reapprove
                </Button>
              ) : (
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3" />Character Locked
                </Badge>
              )}
            </>
          )}
        </div>
      </div>

      {sheet?.needs_review && (
        <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 border" style={{ background: 'rgba(249,115,22,0.07)', borderColor: 'rgba(249,115,22,0.25)' }}>
          <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
          <p className="text-xs text-orange-300/80 text-pretty leading-relaxed">This character sheet needs review due to upstream changes.</p>
        </div>
      )}
      {sheet?.updated_after_approval && !sheet.needs_review && (
        <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 border" style={{ background: 'rgba(229,169,60,0.06)', borderColor: 'rgba(229,169,60,0.2)' }}>
          <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300/80 text-pretty leading-relaxed">This section was edited after approval. Later sections were kept unchanged by creator choice.</p>
        </div>
      )}

      {generating && !sheet && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {FIELDS.map(({ key }) => (
            <Card key={key} className="border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-4 w-28 bg-white/10" />
                <Skeleton className="h-16 w-full bg-white/10" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!generating && !sheet && (
        <Card className="border-dashed border-white/20" style={{ background: 'rgba(139,92,246,0.05)' }}>
          <CardContent className="p-8 text-center space-y-3">
            <User className="h-10 w-10 mx-auto opacity-40" style={{ color: '#8b5cf6' }} />
            <p className="text-white/60 text-sm text-pretty">
              Generate your Character Sheet to define who lives in this world and keep them consistent across every scene.
            </p>
          </CardContent>
        </Card>
      )}

      {sheet && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {FIELDS.map(({ key, label, icon: Icon }) => {
            const value = sheet[key];
            return (
              <Card key={key} className="border-white/10 h-full" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2" style={{ color: '#8b5cf6' }}>
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
