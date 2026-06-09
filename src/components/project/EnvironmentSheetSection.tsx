import { useState } from 'react';
import { supabase } from '@/db/supabase';
import type { EnvironmentSheet, Project } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckCircle2, RefreshCw, Edit3, Loader2, Globe,
  MapPin, Cloud, Layers, Image as ImageIcon, Lightbulb, RotateCcw, ShieldCheck, Save, X, AlertTriangle, Clock
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
  envSheet: EnvironmentSheet | null;
  project: Project;
  generating: boolean;
  onGenerate: () => void;
  onApproved: (e: EnvironmentSheet) => void;
  onSheetUpdate: (e: EnvironmentSheet) => void;
  onChangeLogged?: () => void;
}

const FIELDS: { key: keyof EnvironmentSheet; label: string; icon: React.ElementType }[] = [
  { key: 'main_world_description', label: 'Main World Description', icon: Globe },
  { key: 'key_locations', label: 'Key Locations', icon: MapPin },
  { key: 'weather_atmosphere', label: 'Weather & Atmosphere', icon: Cloud },
  { key: 'textures_materials', label: 'Textures & Materials', icon: Layers },
  { key: 'background_details', label: 'Background Details', icon: ImageIcon },
  { key: 'lighting_conditions', label: 'Lighting Conditions', icon: Lightbulb },
  { key: 'recurring_objects', label: 'Recurring Objects', icon: RotateCcw },
  { key: 'world_consistency_rules', label: 'World Consistency Rules', icon: ShieldCheck },
];

export default function EnvironmentSheetSection({ envSheet, project, generating, onGenerate, onApproved, onSheetUpdate, onChangeLogged }: Props) {
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<EnvironmentSheet>>({});
  const [approving, setApproving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showChoiceDialog, setShowChoiceDialog] = useState(false);
  const [pendingSaveData, setPendingSaveData] = useState<Partial<EnvironmentSheet> | null>(null);

  const handleEdit = () => {
    if (!envSheet) return;
    setEditData({ ...envSheet });
    setEditing(true);
  };

  const handleSave = async () => {
    if (!envSheet) return;
    if (envSheet.approved) {
      setPendingSaveData(editData);
      setShowChoiceDialog(true);
      return;
    }
    await performSave(editData, false);
  };

  const performSave = async (data: Partial<EnvironmentSheet>, updatedAfterApproval: boolean) => {
    if (!envSheet) return;
    setSaving(true);
    try {
      const updates: Partial<EnvironmentSheet> = {};
      FIELDS.forEach(({ key }) => {
        if (data[key] !== undefined) (updates as Record<string, unknown>)[key] = data[key];
      });
      (updates as Record<string, unknown>).updated_after_approval = updatedAfterApproval;
      updates.updated_at = new Date().toISOString();
      const { data: saved, error } = await supabase
        .from('environment_sheets')
        .update(updates)
        .eq('id', envSheet.id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (saved) onSheetUpdate(saved as EnvironmentSheet);
      setEditing(false);
      toast.success('Environment Sheet updated.');
    } catch {
      toast.error('Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!envSheet) return;
    setApproving(true);
    try {
      const now = new Date().toISOString();
      const { error: eErr } = await supabase
        .from('environment_sheets')
        .update({ approved: true, needs_review: false, updated_after_approval: false, last_approved_at: now, updated_at: now })
        .eq('id', envSheet.id);
      if (eErr) throw eErr;

      const { error: pErr } = await supabase
        .from('projects')
        .update({ environment_sheet_approved: true, updated_at: now })
        .eq('id', project.id);
      if (pErr) throw pErr;

      const updated = { ...envSheet, approved: true, needs_review: false, updated_after_approval: false, last_approved_at: now };
      onSheetUpdate(updated as EnvironmentSheet);
      onApproved(updated as EnvironmentSheet);
      toast.success('Environment Sheet approved! Your world is locked in.');
    } catch {
      toast.error('Failed to approve Environment Sheet.');
    } finally {
      setApproving(false);
    }
  };

  const handleMarkDownstream = async () => {
    setShowChoiceDialog(false);
    if (!envSheet || !pendingSaveData) return;
    await performSave(pendingSaveData, true);
    await supabase.from('scene_images').update({ needs_review: true, updated_at: new Date().toISOString() }).eq('project_id', project.id);
    await createChangeLogEntry({
      projectId: project.id,
      sectionName: 'Environment Sheet',
      sectionType: 'environment_sheet',
      sectionRecordId: envSheet.id,
      changeType: 'marked_downstream_needs_review',
      changeSummary: 'Environment Sheet edited after approval. Scene Images marked for review.',
      affectedSections: DOWNSTREAM_DEPS['environment_sheet'],
      userChoice: 'Mark affected sections as Needs Review',
    });
    onChangeLogged?.();
    toast.success('Environment Sheet updated. Scene Images marked for review.');
    setPendingSaveData(null);
  };

  const handleKeepUnchanged = async () => {
    setShowChoiceDialog(false);
    if (!envSheet || !pendingSaveData) return;
    await performSave(pendingSaveData, true);
    await createChangeLogEntry({
      projectId: project.id,
      sectionName: 'Environment Sheet',
      sectionType: 'environment_sheet',
      sectionRecordId: envSheet.id,
      changeType: 'kept_later_sections_unchanged',
      changeSummary: 'Environment Sheet edited after approval. Creator chose to keep later sections unchanged.',
      affectedSections: DOWNSTREAM_DEPS['environment_sheet'],
      userChoice: 'Keep later sections unchanged',
    });
    onChangeLogged?.();
    toast.success('Environment Sheet updated. Later sections kept unchanged.');
    setPendingSaveData(null);
  };

  const handleReapprove = async () => {
    if (!envSheet) return;
    setApproving(true);
    try {
      await reapproveSection('environment_sheets', envSheet.id);
      const now = new Date().toISOString();
      onSheetUpdate({ ...envSheet, needs_review: false, updated_after_approval: false, last_approved_at: now });
      await createChangeLogEntry({
        projectId: project.id,
        sectionName: 'Environment Sheet',
        sectionType: 'environment_sheet',
        sectionRecordId: envSheet.id,
        changeType: 'reapproved',
        changeSummary: 'Environment Sheet reapproved after changes.',
        affectedSections: [],
      });
      onChangeLogged?.();
      toast.success('Environment Sheet reapproved.');
    } catch {
      toast.error('Failed to reapprove.');
    } finally {
      setApproving(false);
    }
  };

  const reviewStatus: ReviewSectionStatus | null = envSheet
    ? envSheet.needs_review
      ? 'Needs Review'
      : envSheet.updated_after_approval
      ? 'Updated After Approval'
      : envSheet.approved
      ? 'Approved'
      : null
    : null;

  return (
    <div className="space-y-4">
      <AfterEditChoiceDialog
        open={showChoiceDialog}
        sectionType="environment_sheet"
        sectionName="Environment Sheet"
        onMarkDownstream={handleMarkDownstream}
        onKeepUnchanged={handleKeepUnchanged}
        onClose={() => { setShowChoiceDialog(false); setPendingSaveData(null); }}
      />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <Globe className="h-5 w-5 shrink-0" style={{ color: '#10b981' }} />
          <h3 className="text-lg font-semibold text-white text-balance">Environment Sheet</h3>
          {reviewStatus && <ReviewStatusBadge status={reviewStatus} />}
          {envSheet?.approved && !envSheet.needs_review && !envSheet.updated_after_approval && (
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 shrink-0">Approved</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {envSheet && (
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
                  <Button size="sm" onClick={handleSave} disabled={saving} className="text-white font-semibold" style={{ background: 'linear-gradient(135deg,#10b981,#3b7eff)' }}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}Save
                  </Button>
                </>
              )}
              <Button variant="ghost" size="sm" onClick={onGenerate} disabled={generating} className="border border-white/20 text-white/70 hover:bg-white/10 hover:text-white">
                {generating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}Regenerate
              </Button>
              {!envSheet.approved ? (
                <Button size="sm" onClick={handleApprove} disabled={approving} className="text-white font-semibold" style={{ background: 'linear-gradient(135deg,#10b981,#3b7eff)' }}>
                  {approving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}Approve Environment Sheet
                </Button>
              ) : (envSheet.needs_review || envSheet.updated_after_approval) ? (
                <Button size="sm" onClick={handleReapprove} disabled={approving} className="text-white font-semibold" style={{ background: 'linear-gradient(135deg,#10b981,#3b7eff)' }}>
                  {approving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}Reapprove
                </Button>
              ) : (
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3" />World Locked
                </Badge>
              )}
            </>
          )}
        </div>
      </div>

      {envSheet?.needs_review && (
        <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 border" style={{ background: 'rgba(249,115,22,0.07)', borderColor: 'rgba(249,115,22,0.25)' }}>
          <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
          <p className="text-xs text-orange-300/80 text-pretty leading-relaxed">This environment sheet needs review due to upstream changes.</p>
        </div>
      )}
      {envSheet?.updated_after_approval && !envSheet.needs_review && (
        <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 border" style={{ background: 'rgba(229,169,60,0.06)', borderColor: 'rgba(229,169,60,0.2)' }}>
          <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300/80 text-pretty leading-relaxed">This section was edited after approval. Later sections were kept unchanged by creator choice.</p>
        </div>
      )}

      {generating && !envSheet && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {FIELDS.map(({ key }) => (
            <Card key={key} className="border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-4 w-32 bg-white/10" />
                <Skeleton className="h-16 w-full bg-white/10" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!generating && !envSheet && (
        <Card className="border-dashed border-white/20" style={{ background: 'rgba(16,185,129,0.05)' }}>
          <CardContent className="p-8 text-center space-y-3">
            <Globe className="h-10 w-10 mx-auto opacity-40" style={{ color: '#10b981' }} />
            <p className="text-white/60 text-sm text-pretty">
              Generate your Environment Sheet to define every location, texture, and atmospheric rule of your world.
            </p>
          </CardContent>
        </Card>
      )}

      {envSheet && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {FIELDS.map(({ key, label, icon: Icon }) => {
            const value = envSheet[key];
            return (
              <Card key={key} className="border-white/10 h-full" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2" style={{ color: '#10b981' }}>
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
