import { useState } from 'react';
import { supabase } from '@/db/supabase';
import type { VisualWorldReport, Project } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckCircle2, RefreshCw, Edit3, Loader2, Sparkles, Star,
  Brain, Globe, Palette, Lightbulb, Users, Gem, MapPin, Film, Save, X, AlertTriangle, Clock
} from 'lucide-react';
import { toast } from 'sonner';
import AfterEditChoiceDialog from '@/components/project/AfterEditChoiceDialog';
import {
  DOWNSTREAM_DEPS,
  createChangeLogEntry,
  markUpdatedAfterApproval,
  markNeedsReview,
  reapproveSection,
} from '@/hooks/useReviewChanges';
import { ReviewStatusBadge } from '@/components/project/ReviewChangesPanel';
import type { ReviewSectionStatus } from '@/components/project/ReviewChangesPanel';

interface Props {
  report: VisualWorldReport | null;
  project: Project;
  generating: boolean;
  onRegenerate: () => void;
  onApproved: () => void;
  onReportUpdate: (r: VisualWorldReport) => void;
  onChangeLogged?: () => void;
}

const FIELDS: { key: keyof VisualWorldReport; label: string; icon: React.ElementType }[] = [
  { key: 'song_summary', label: 'Song Summary', icon: Brain },
  { key: 'emotional_core', label: 'Emotional Core', icon: Sparkles },
  { key: 'main_visual_world', label: 'Main Visual World', icon: Globe },
  { key: 'color_palette', label: 'Color Palette', icon: Palette },
  { key: 'lighting_style', label: 'Lighting Style', icon: Lightbulb },
  { key: 'main_characters', label: 'Main Characters', icon: Users },
  { key: 'symbolic_objects', label: 'Symbolic Objects', icon: Gem },
  { key: 'key_locations', label: 'Key Locations', icon: MapPin },
  { key: 'story_direction', label: 'Story Direction', icon: Film },
];

export default function VisualWorldReportSection({ report, project, generating, onRegenerate, onApproved, onReportUpdate, onChangeLogged }: Props) {
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<VisualWorldReport>>({});
  const [approving, setApproving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showChoiceDialog, setShowChoiceDialog] = useState(false);
  const [pendingSaveData, setPendingSaveData] = useState<Partial<VisualWorldReport> | null>(null);

  const handleApprove = async () => {
    if (!report) return;
    setApproving(true);
    try {
      const now = new Date().toISOString();
      const { error: rError } = await supabase
        .from('visual_world_reports')
        .update({ approved: true, needs_review: false, updated_after_approval: false, last_approved_at: now, updated_at: now })
        .eq('id', report.id);
      if (rError) throw rError;

      const { error: pError } = await supabase
        .from('projects')
        .update({ world_approved: true, status: 'World Approved', updated_at: now })
        .eq('id', project.id);
      if (pError) throw pError;

      onReportUpdate({ ...report, approved: true, needs_review: false, updated_after_approval: false, last_approved_at: now });
      onApproved();
      toast.success('World approved! Your storyboard is now unlocked.');
    } catch {
      toast.error('Failed to approve world');
    } finally {
      setApproving(false);
    }
  };

  const handleEdit = () => {
    if (!report) return;
    setEditData({
      song_summary: report.song_summary || '',
      emotional_core: report.emotional_core || '',
      main_visual_world: report.main_visual_world || '',
      color_palette: report.color_palette || '',
      lighting_style: report.lighting_style || '',
      main_characters: report.main_characters || '',
      symbolic_objects: report.symbolic_objects || '',
      key_locations: report.key_locations || '',
      story_direction: report.story_direction || '',
    });
    setEditing(true);
  };

  const handleSave = async () => {
    if (!report) return;
    // If already approved, show choice dialog
    if (report.approved) {
      setPendingSaveData(editData);
      setShowChoiceDialog(true);
      return;
    }
    await performSave(editData);
  };

  const performSave = async (data: Partial<VisualWorldReport>) => {
    if (!report) return;
    setSaving(true);
    try {
      const updates = { ...data, updated_at: new Date().toISOString() };
      const { data: updated, error } = await supabase
        .from('visual_world_reports')
        .update(updates)
        .eq('id', report.id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (updated) onReportUpdate(updated);
      setEditing(false);
      toast.success('Visual World Report updated.');
    } catch {
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkDownstream = async () => {
    setShowChoiceDialog(false);
    if (!report || !pendingSaveData) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const updates = { ...pendingSaveData, updated_after_approval: true, updated_at: now };
      const { data: updated, error } = await supabase
        .from('visual_world_reports')
        .update(updates)
        .eq('id', report.id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (updated) onReportUpdate(updated as VisualWorldReport);

      // Mark all downstream sections as needs_review in DB (best-effort per project)
      const affected = DOWNSTREAM_DEPS['visual_world_report'];
      const tableMap: Record<string, string> = {
        'Storyboard': 'storyboard_scenes',
        'Characters & Environment': 'character_environments',
        'World Style Bible': 'world_style_bibles',
        'Character Sheet': 'character_sheets',
        'Environment Sheet': 'environment_sheets',
        'Scene Visual Prompts': 'scene_visual_prompts',
        'Scene Images': 'scene_images',
      };
      await Promise.all(
        Object.entries(tableMap).map(([, tbl]) =>
          supabase.from(tbl).update({ needs_review: true, updated_at: now }).eq('project_id', project.id)
        )
      );

      await createChangeLogEntry({
        projectId: project.id,
        sectionName: 'Visual World Report',
        sectionType: 'visual_world_report',
        sectionRecordId: report.id,
        changeType: 'marked_downstream_needs_review',
        changeSummary: 'Creator edited approved Visual World Report and marked downstream sections as Needs Review.',
        affectedSections: affected,
        userChoice: 'Mark affected sections as Needs Review',
      });
      await createChangeLogEntry({
        projectId: project.id,
        sectionName: 'Visual World Report',
        sectionType: 'visual_world_report',
        sectionRecordId: report.id,
        changeType: 'edited_after_approval',
        changeSummary: 'Visual World Report edited after approval.',
        affectedSections: affected,
        userChoice: 'Mark affected sections as Needs Review',
      });

      setEditing(false);
      onChangeLogged?.();
      toast.success('World updated. Affected sections marked for review.');
    } catch {
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
      setPendingSaveData(null);
    }
  };

  const handleKeepUnchanged = async () => {
    setShowChoiceDialog(false);
    if (!report || !pendingSaveData) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const updates = { ...pendingSaveData, updated_after_approval: true, updated_at: now };
      const { data: updated, error } = await supabase
        .from('visual_world_reports')
        .update(updates)
        .eq('id', report.id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (updated) onReportUpdate(updated as VisualWorldReport);

      await createChangeLogEntry({
        projectId: project.id,
        sectionName: 'Visual World Report',
        sectionType: 'visual_world_report',
        sectionRecordId: report.id,
        changeType: 'kept_later_sections_unchanged',
        changeSummary: 'Creator edited approved Visual World Report and chose to keep later sections unchanged.',
        affectedSections: DOWNSTREAM_DEPS['visual_world_report'],
        userChoice: 'Keep later sections unchanged',
      });

      setEditing(false);
      onChangeLogged?.();
      toast.success('World updated. Later sections kept unchanged.');
    } catch {
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
      setPendingSaveData(null);
    }
  };

  const handleReapprove = async () => {
    if (!report) return;
    setApproving(true);
    try {
      await reapproveSection('visual_world_reports', report.id);
      const now = new Date().toISOString();
      onReportUpdate({ ...report, needs_review: false, updated_after_approval: false, last_approved_at: now });
      await createChangeLogEntry({
        projectId: project.id,
        sectionName: 'Visual World Report',
        sectionType: 'visual_world_report',
        sectionRecordId: report.id,
        changeType: 'reapproved',
        changeSummary: 'Creator reapproved Visual World Report after changes.',
        affectedSections: [],
        userChoice: 'Reapprove',
      });
      onChangeLogged?.();
      toast.success('Visual World Report reapproved.');
    } catch {
      toast.error('Failed to reapprove');
    } finally {
      setApproving(false);
    }
  };

  const reviewStatus: ReviewSectionStatus | null = report
    ? report.needs_review
      ? 'Needs Review'
      : report.updated_after_approval
      ? 'Updated After Approval'
      : report.approved
      ? 'Approved'
      : null
    : null;

  const score = report?.creative_match_score || 0;

  return (
    <div className="space-y-5">
      <AfterEditChoiceDialog
        open={showChoiceDialog}
        sectionType="visual_world_report"
        sectionName="Visual World Report"
        onMarkDownstream={handleMarkDownstream}
        onKeepUnchanged={handleKeepUnchanged}
        onClose={() => { setShowChoiceDialog(false); setPendingSaveData(null); }}
      />

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Globe className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-foreground">Visual World Report</h2>
            <p className="text-xs text-muted-foreground">The world hidden inside your song</p>
          </div>
          {reviewStatus && <ReviewStatusBadge status={reviewStatus} />}
        </div>
        {report && !generating && (
          <div className="flex gap-2 flex-wrap">
            {/* Always show Edit + Regenerate after approval (persistent edit) */}
            {report.approved && !editing && (
              <>
                <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground border border-border h-8" onClick={handleEdit}>
                  <Edit3 className="w-3.5 h-3.5 mr-1.5" /> Edit World
                </Button>
                <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground border border-border h-8" onClick={onRegenerate}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Regenerate
                </Button>
                {(report.needs_review || report.updated_after_approval) && (
                  <Button size="sm" className="h-8 text-white font-medium" style={{ background: 'linear-gradient(135deg,#10b981,#3b7eff)' }} onClick={handleReapprove} disabled={approving}>
                    {approving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                    Reapprove
                  </Button>
                )}
              </>
            )}
            {!report.approved && (
              <>
                {!editing ? (
                  <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground border border-border h-8" onClick={handleEdit}>
                    <Edit3 className="w-3.5 h-3.5 mr-1.5" /> Edit World
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
                <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 h-8" onClick={handleApprove} disabled={approving}>
                  {approving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                  Approve World
                </Button>
              </>
            )}
            {editing && report.approved && (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground border border-border h-8" onClick={() => setEditing(false)}>
                  <X className="w-3.5 h-3.5 mr-1" /> Cancel
                </Button>
                <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 h-8" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                  Save
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Needs review warning banner */}
      {report?.needs_review && (
        <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 border" style={{ background: 'rgba(249,115,22,0.07)', borderColor: 'rgba(249,115,22,0.25)' }}>
          <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
          <p className="text-xs text-orange-300/80 text-pretty leading-relaxed">
            This section needs review. An upstream change may have affected the visual world. Review and reapprove to confirm it still matches your vision.
          </p>
        </div>
      )}
      {report?.updated_after_approval && !report.needs_review && (
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
              <p className="text-sm text-foreground font-medium">BeatVision is reading your song...</p>
            </div>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-24 bg-muted" />
                <Skeleton className="h-14 w-full bg-muted" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : report ? (
        <>
          {/* Creative Match Score */}
          <Card className="bg-card border-border card-glow">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-16 h-16 rounded-full border-2 border-primary flex items-center justify-center shrink-0 relative">
                <span className="text-xl font-bold text-primary">{score}</span>
                <span className="text-xs text-primary absolute -bottom-1 bg-card px-1">/ 100</span>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Star className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm text-foreground">Creative Match Score</span>
                </div>
                <p className="text-xs text-muted-foreground text-pretty">
                  {score >= 90 ? 'Exceptional — BeatVision found a deep resonance with your song.' :
                    score >= 80 ? 'Strong — The visual world closely matches your song\'s emotional core.' :
                      'Good — A solid foundation. Approve and refine in later steps.'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Report Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FIELDS.map(({ key, label, icon: Icon }) => {
              const value = (report[key] as string) || '';
              return (
                <Card key={key} className="bg-card border-border h-full">
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
                      <p className="text-sm text-foreground leading-relaxed text-pretty">{value || '—'}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center">
            <Globe className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No world report generated yet.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
